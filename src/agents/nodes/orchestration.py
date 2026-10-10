"""Node điều phối (PRD 10.1 bước 2–3, 10.3; FR-11; BR-06).

policy  → chặn yêu cầu xin đáp án bài tính điểm trước khi truy xuất (BR-06).
router  → LLM đọc câu hỏi + ngữ cảnh gần nhất, chọn MÔN (chỉ trong danh sách môn backend cho phép, D-28) và
          trợ lý Academic/Learning/Hub, hoặc hỏi làm rõ (FR-11.1–11.2); rút tham số Learning từ câu hỏi.
academic / learning / hub → gọi dịch vụ trợ lý tương ứng; mọi truy xuất đều lọc quyền trong dịch vụ (BR-03).
"""

from __future__ import annotations

import re
from typing import Any

from langchain_core.runnables import RunnableConfig

from src.agents.orchestrator_state import OrchestratorState, RouteDecision
from src.models.orm import StudyPlan
from src.services.assistants import (
    AssistantResult,
    LlmError,
    academic,
    call_json,
    format_history,
    hub,
    learning,
    study_tools,
)
from src.services.errors import not_found
from src.services.learning_path import service as learning_path
from src.services.policy import INTEGRITY_MESSAGE, PLAN_STUDENT_ONLY_MESSAGE, is_integrity_violation

ROUTER_SYSTEM = """Bạn là bộ điều phối (router) của hệ thống trợ lý học tập. Nhiệm vụ DUY NHẤT: xác định MÔN và
ý định của người dùng, KHÔNG trả lời câu hỏi. Chỉ được chọn môn trong DANH SÁCH MÔN ĐƯỢC PHÉP; không bao giờ chọn
nhiều môn hay "tất cả".
MÔN: chọn môn mà nội dung câu hỏi thuộc về. Câu nối tiếp ("còn cái kia thì sao", "giải thích thêm") giữ MÔN LƯỢT
TRƯỚC. Không xác định được môn → course_id null.
- "hub": CHỈ khi muốn TÌM/LIỆT KÊ/MỞ tài liệu, slide, giáo trình, trang ("tìm tài liệu về…", "slide nào nói về…",
  "có tài liệu nào về…", "mở giáo trình…") — kết quả là DANH SÁCH tài liệu, không phải câu trả lời.
- "academic": hỏi kiến thức, định nghĩa, so sánh, tổng hợp, câu hỏi nối tiếp về nội dung môn — KỂ CẢ khi câu hỏi nhắc
  tới "tài liệu": "theo tài liệu, X là gì?", "tài liệu này nói gì về X?", "tóm tắt tài liệu/nội dung về X",
  "trong slide, X cần bao nhiêu…" đều là "academic" (người dùng muốn câu TRẢ LỜI, không muốn danh sách tài liệu).
- "learning" — chọn learning_action:
  * "explain": giải thích theo mức hiểu ("giải thích dễ hơn", "từng bước");
  * "quiz": tự kiểm tra về một chủ đề cụ thể ("cho tôi câu hỏi ôn về…");
  * "diagnose": KHÔNG BIẾT BẮT ĐẦU TỪ ĐÂU / muốn kiểm tra kiến thức nền ("tôi mới học", "không biết bắt đầu từ đâu",
    "kiểm tra nền tảng của tôi");
  * "flashcards": muốn thẻ ghi nhớ/flashcard; "cloze": muốn bài điền khuyết/điền vào chỗ trống;
  * "plan": lập/điều chỉnh lộ trình học/ôn tập nhiều ngày.
- "clarify": ý định thật sự mơ hồ, không thể chọn một trong ba (không dùng khi chỉ thiếu chi tiết nhỏ).
Trả về DUY NHẤT JSON:
{"course_id":"mã môn trong danh sách hoặc null","assistant":"academic|learning|hub|clarify",
 "learning_action":"explain|quiz|mcq|diagnose|flashcards|cloze|plan|null (mcq = trắc nghiệm A–D; quiz = câu hỏi tự luận ngắn)",
 "level":"short|step|detailed|null","goal":"mục tiêu/chủ đề cho lộ trình hoặc null","topic":"chủ đề/khái niệm chính (quiz, diagnose, flashcards, cloze) hoặc null",
 "search_terms":"thuật ngữ chuyên ngành chính của yêu cầu KÈM tên tiếng Anh (vd \"cây khung spanning tree\")",
 "days":số_ngày_hoặc_null,"minutes_per_day":số_phút_mỗi_ngày_hoặc_null,
 "question":"YÊU CẦU MỚI viết lại thành câu hỏi ĐẦY ĐỦ, tự hiểu được không cần ngữ cảnh — ghép NGỮ CẢNH GẦN NHẤT khi
   yêu cầu mới là câu trả lời ngắn cho câu hỏi làm rõ hoặc câu nối tiếp (vd ngữ cảnh hỏi 'giải thích khái niệm nào',
   yêu cầu mới 'Bài 8: Nguyên lý thiết kế' → 'Giải thích các khái niệm chính trong bài Nguyên lý thiết kế phần mềm');
   yêu cầu đã đầy đủ thì chép nguyên; KHÔNG trả lời, KHÔNG thêm ý người dùng không nói",
 "clarification":"câu hỏi làm rõ ngắn nếu clarify, ngược lại null",
 "choices":["2–4 lựa chọn NGẮN người dùng bấm để trả lời câu làm rõ (chỉ khi clarify; không đề xuất làm bài/giải đề hộ), ngược lại []"],
 "reason":"lý do ngắn"}
Chỉ điền days/minutes_per_day khi người dùng NÓI RÕ con số; không tự đoán."""

ASSISTANTS = ("academic", "learning", "hub", "clarify")
ACTIONS = ("explain", "quiz", "mcq", "diagnose", "flashcards", "cloze", "plan")
LEVELS = ("short", "step", "detailed")


def _deps(config: RunnableConfig) -> dict[str, Any]:
    return config["configurable"]


def _step(state: OrchestratorState, name: str) -> list[str]:
    return [*state.get("steps", []), name]


def _int(v: Any) -> int | None:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def policy_node(state: OrchestratorState) -> dict[str, Any]:
    if is_integrity_violation(state["question"]):
        return {
            "integrity": "redirect",
            "result": AssistantResult(status="integrity_redirect", content=INTEGRITY_MESSAGE),
            "steps": _step(state, "policy:redirect"),
        }
    return {"integrity": "allow", "steps": _step(state, "policy:allow")}


def _course_prompt(state: OrchestratorState, empty: set[str] = frozenset()) -> str:
    # Môn chưa có tài liệu đã phát hành: vẫn cho chọn khi người dùng nêu rõ, nhưng router không đoán vào môn rỗng
    note = " (CHƯA có tài liệu đã phát hành — chỉ chọn khi người dùng nêu rõ môn này)"
    lines = [f"- {cid}: {name}{note if cid in empty else ''}" for cid, name in state["courses"]]
    prev = state.get("previous_course_id") or "không có"
    return "DANH SÁCH MÔN ĐƯỢC PHÉP:\n" + "\n".join(lines) + f"\nMÔN LƯỢT TRƯỚC: {prev}"


def _empty_courses(config: RunnableConfig, allowed: set[str]) -> set[str]:
    """Môn user được đọc nhưng chưa có bản tài liệu nào đang phục vụ (đếm theo đúng quyền của user)."""
    from src.services.retrieval import servable_versions

    d = _deps(config)
    return {cid for cid in allowed if not servable_versions(d["db"], d["user"], cid)}


def _ask_course(state: OrchestratorState) -> str:
    return "Câu hỏi của bạn thuộc môn nào: " + ", ".join(name for _, name in state["courses"]) + "?"


# Nút vô nghĩa ("Khác", "Môn khác" — muốn khác thì gõ) hoặc dẫn tới làm bài hộ (bấm là bị chặn BR-06) → bỏ
_BAD_CHOICE = re.compile(r"(?:^|\s)khác$|giải (?:bài|đề)|làm (?:bài|hộ)|đáp án|lời giải", re.I)


def _choices(raw: Any) -> list[str] | None:
    if not isinstance(raw, list):
        return None
    out = [str(c).strip()[:80] for c in raw if str(c).strip()]
    return [c for c in out if not _BAD_CHOICE.search(c)][:4] or None


def router_node(state: OrchestratorState, config: RunnableConfig) -> dict[str, Any]:
    allowed = {cid for cid, _ in state["courses"]}
    single = next(iter(allowed)) if len(allowed) == 1 else None
    manual = state.get("mode", "auto") != "auto"
    if manual and single and state.get("mode") != "learning":  # đã biết trợ lý + một môn → không cần gọi LLM
        return _manual(state, single, "người dùng chọn trợ lý; chỉ có một môn")

    try:
        data = call_json(
            ROUTER_SYSTEM,
            f"{_course_prompt(state, _empty_courses(config, allowed))}\nNGỮ CẢNH GẦN NHẤT:\n{format_history(state.get('history', []))}"
            f"\n\nYÊU CẦU MỚI: {state['question']}",
            temperature=0,
        )
    except LlmError:
        if not manual:
            raise
        # Ôn tập ép qua API: router chỉ để bổ sung thuật ngữ — lỗi thì vẫn chạy với môn đã biết, không có thuật ngữ
        return _manual(state, single, "người dùng chọn trợ lý; router lỗi")
    course_id = data.get("course_id") if data.get("course_id") in allowed else None
    course_id = course_id or single  # chỉ một môn: không cần hỏi lại
    if manual:
        return _manual(state, course_id, "người dùng chọn trợ lý", data.get("search_terms"))
    assistant = data.get("assistant") if data.get("assistant") in ASSISTANTS else "clarify"
    route: RouteDecision = {
        "course_id": course_id,
        "assistant": assistant,
        "learning_action": data.get("learning_action") if data.get("learning_action") in ACTIONS else None,
        "level": data.get("level") if data.get("level") in LEVELS else None,
        "goal": (str(data["goal"]).strip() or None) if data.get("goal") else None,
        "topic": (str(data["topic"]).strip() or None) if data.get("topic") else None,
        "search_terms": str(data.get("search_terms") or "").strip()[:200] or None,
        "days": _int(data.get("days")),
        "minutes_per_day": _int(data.get("minutes_per_day")),
        "clarification": (str(data["clarification"]).strip() or None) if data.get("clarification") else None,
        "choices": _choices(data.get("choices")),
        "reason": str(data.get("reason") or "")[:300],
    }
    if assistant == "learning" and route["learning_action"] is None:
        route["learning_action"] = "explain"
    if course_id is None and assistant != "clarify":
        # BR-02/FR-01.3: chưa xác định được môn thì không truy xuất; hỏi người dùng
        route["assistant"], route["clarification"], route["ask_course"] = "clarify", _ask_course(state), True
    out: dict[str, Any] = {"route": route, "course_id": course_id}
    rewritten = str(data.get("question") or "").strip()[:1000]
    if rewritten and rewritten != state["question"] and not is_integrity_violation(rewritten):
        out["question"] = rewritten  # câu trả lời ngắn cho câu làm rõ → câu hỏi đầy đủ cho trợ lý (không cộng dồn chuỗi)
    return out | {"steps": _step(state, f"router:{route['assistant']}@{course_id}")}


def _manual(state: OrchestratorState, course_id: str | None, reason: str, search_terms: Any = None) -> dict[str, Any]:
    """Ép trợ lý qua API (FR-11.5): vẫn qua policy và vẫn phải chốt môn (AC-11.4)."""
    opts = state.get("options") or {}
    route: RouteDecision = {"course_id": course_id, "assistant": state["mode"], "reason": reason}  # type: ignore[typeddict-item]
    if search_terms:
        route["search_terms"] = str(search_terms).strip()[:200] or None
    if state["mode"] == "learning":
        route["learning_action"] = opts.get("action") if opts.get("action") in ACTIONS else "explain"
    if course_id is None:
        route["assistant"], route["clarification"], route["ask_course"] = "clarify", _ask_course(state), True
    return {"route": route, "course_id": course_id, "steps": _step(state, f"manual:{route['assistant']}@{course_id}")}


INTENT_CHOICES = (("Trả lời câu hỏi kiến thức", "academic"), ("Giải thích / lập lộ trình học", "learning"),
                  ("Tìm tài liệu", "hub"))  # fmt: skip


def clarify_node(state: OrchestratorState) -> dict[str, Any]:
    """Hỏi lại kèm nút lựa chọn (payload "choices": label + nội dung gửi tiếp + trợ lý ép nếu có) — bấm là chạy tiếp
    câu hỏi gốc, không phải gõ lại."""
    route, asked = state["route"], state["question"]
    question = route.get("clarification") or (
        "Bạn muốn mình trả lời câu hỏi kiến thức, giải thích/lập lộ trình học, hay tìm tài liệu?"
    )
    if route.get("ask_course") or not state.get("course_id"):  # chưa biết môn → luôn đưa đủ các môn user được đọc
        choices = [{"label": name, "send": f"Môn {name}"} for _, name in state["courses"]]
    elif route.get("choices"):
        choices = [{"label": c, "send": c} for c in route["choices"]]
    else:
        choices = [{"label": label, "send": asked, "assistant": mode} for label, mode in INTENT_CHOICES]
    result = AssistantResult(status="needs_clarification", content=question, payload={"choices": choices})
    return {"result": result, "steps": _step(state, "clarify")}


def _retrieval_query(text: str, route: RouteDecision) -> str:
    """Câu gốc + thuật ngữ router rút ra (kèm tên tiếng Anh) — không hạ ngưỡng bằng chứng (Q-17)."""
    have = set(re.findall(r"\w+", text.casefold()))
    extra = [w for w in re.findall(r"\w+", route.get("search_terms") or "") if w.casefold() not in have]
    return f"{text} ({' '.join(dict.fromkeys(extra))})" if extra else text


def academic_node(state: OrchestratorState, config: RunnableConfig) -> dict[str, Any]:
    d = _deps(config)
    result = academic.answer(
        d["db"], d["user"], state["course_id"], state["question"], state.get("history", []),
        retrieval_query=_retrieval_query(state["question"], state["route"]),
        search_terms=state["route"].get("search_terms"),
    )  # fmt: skip
    return {"result": result, "steps": _step(state, "academic")}


def hub_node(state: OrchestratorState, config: RunnableConfig) -> dict[str, Any]:
    d = _deps(config)
    return {"result": hub.find(d["db"], d["user"], state["course_id"], state["question"]), "steps": _step(state, "hub")}


def learning_node(state: OrchestratorState, config: RunnableConfig) -> dict[str, Any]:
    d = _deps(config)
    route, opts = state["route"], state.get("options") or {}
    action = route.get("learning_action") or "explain"
    question = state["question"]

    # topic: chủ đề hiển thị/đưa vào prompt; query: topic + thuật ngữ router rút ra, CHỈ dùng để truy xuất
    topic = opts.get("topic") or route.get("topic") or question
    query = _retrieval_query(topic, route)
    count = _int(opts.get("count"))  # số câu/thẻ người học chọn (3–50 theo số bài, đã kiểm ở API)
    # D-51: người học chọn nhiều chủ đề → truy xuất riêng từng chủ đề (multi_topic) để câu hỏi trải đều
    with academic.multi_topic(opts.get("topics")):
        return _learning_action(d, state, action, topic, query, count)


def _learning_action(
    d: dict[str, Any], state: OrchestratorState, action: str, topic: str, query: str, count: int | None
) -> dict[str, Any]:
    db, user, course_id = d["db"], d["user"], state["course_id"]
    route, opts, question = state["route"], state.get("options") or {}, state["question"]
    if action == "quiz":
        result = learning.quiz(db, user, course_id, topic, query, n=count)
    elif action == "mcq":
        result = study_tools.mcq(db, user, course_id, topic, query, count=count)
    elif action == "diagnose":
        # D-82: môn có chương trình học → đánh giá theo phạm vi đã học, kết quả dẫn tới chọn lộ trình (trong thẻ chat)
        result = learning_path.chat_entry(db, user, course_id) or study_tools.diagnose(
            db, user, course_id, topic, query
        )
    elif action in ("flashcards", "cloze"):
        result = study_tools.flashcards(db, user, course_id, topic, action, query, count=count)
    elif action == "plan" and user.role != "student":  # lộ trình chỉ cho sinh viên (PRD FR-03), không tạo StudyPlan
        result = AssistantResult(status="needs_clarification", content=PLAN_STUDENT_ONLY_MESSAGE)
    elif action == "plan":
        previous = None
        if opts.get("previous_plan_id"):
            previous = db.get(StudyPlan, opts["previous_plan_id"])
            if previous is None or previous.owner_id != user.id:
                raise not_found()
        goal = opts.get("goal") or route.get("goal") or question
        dates = opts.get("dates") or None  # D-46: ngày cụ thể người học chọn trên lịch (đã chuẩn hoá ở API)
        days = len(dates) if dates else (_int(opts.get("days")) or route.get("days"))
        minutes = _int(opts.get("minutes_per_day")) or route.get("minutes_per_day")
        result, plan_data = learning.plan(db, user, course_id, goal, days, minutes, previous)
        if plan_data is not None:
            result.payload["plan_data"] = {
                **plan_data,
                "goal": goal,
                "days": days,
                "minutes": minutes,
                "previous_id": previous.id if previous else None,
                "previous_version": previous.version if previous else 0,
                "dates": dates,
            }
    else:
        level = opts.get("level") or route.get("level")
        result = learning.explain(
            db, user, course_id, question, state.get("history", []), level, _retrieval_query(question, route)
        )
    return {"result": result, "steps": _step(state, f"learning:{action}")}
