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
from src.services.assistants import AssistantResult, academic, call_json, format_history, hub, learning, study_tools
from src.services.errors import not_found
from src.services.policy import INTEGRITY_MESSAGE, is_integrity_violation

ROUTER_SYSTEM = """Bạn là bộ điều phối (router) của hệ thống trợ lý học tập. Nhiệm vụ DUY NHẤT: xác định MÔN và
ý định của người dùng, KHÔNG trả lời câu hỏi. Chỉ được chọn môn trong DANH SÁCH MÔN ĐƯỢC PHÉP; không bao giờ chọn
nhiều môn hay "tất cả".
MÔN: chọn môn mà nội dung câu hỏi thuộc về. Câu nối tiếp ("còn cái kia thì sao", "giải thích thêm") giữ MÔN LƯỢT
TRƯỚC. Không xác định được môn → course_id null.
- "hub": muốn TÌM/LIỆT KÊ/MỞ tài liệu, slide, giáo trình, trang chứa nội dung ("tìm tài liệu về…", "slide nào nói về…").
- "academic": hỏi kiến thức, định nghĩa, so sánh, tổng hợp, câu hỏi nối tiếp về nội dung môn.
- "learning" — chọn learning_action:
  * "explain": giải thích theo mức hiểu ("giải thích dễ hơn", "từng bước");
  * "analogy": giải thích bằng ví dụ/ẩn dụ đời thường ("giải thích bằng ví dụ bóng đá/trà sữa…") → điền analogy_context;
  * "quiz": tự kiểm tra về một chủ đề cụ thể ("cho tôi câu hỏi ôn về…");
  * "diagnose": KHÔNG BIẾT BẮT ĐẦU TỪ ĐÂU / muốn kiểm tra kiến thức nền ("tôi mới học", "không biết bắt đầu từ đâu",
    "kiểm tra nền tảng của tôi");
  * "flashcards": muốn thẻ ghi nhớ/flashcard; "cloze": muốn bài điền khuyết/điền vào chỗ trống;
  * "triage": sắp thi gấp / cấp cứu ("mai thi", "đêm nay cày", "ôn cấp tốc", "chỉ cần những gì phải thuộc");
  * "plan": lập/điều chỉnh lộ trình học/ôn tập nhiều ngày.
- "clarify": ý định thật sự mơ hồ, không thể chọn một trong ba (không dùng khi chỉ thiếu chi tiết nhỏ).
Trả về DUY NHẤT JSON:
{"course_id":"mã môn trong danh sách hoặc null","assistant":"academic|learning|hub|clarify",
 "learning_action":"explain|analogy|quiz|diagnose|flashcards|cloze|triage|plan|null",
 "level":"short|step|detailed|null","goal":"mục tiêu/chủ đề cho lộ trình hoặc null","topic":"chủ đề/khái niệm chính (quiz, diagnose, flashcards, cloze, triage, analogy — với analogy chỉ ghi khái niệm, KHÔNG kèm bối cảnh ẩn dụ) hoặc null",
 "analogy_context":"bối cảnh ẩn dụ người dùng muốn (vd bóng đá) hoặc null",
 "search_terms":"thuật ngữ chuyên ngành chính của yêu cầu KÈM tên tiếng Anh (vd \"cây khung spanning tree\")",
 "days":số_ngày_hoặc_null,"minutes_per_day":số_phút_mỗi_ngày_hoặc_null,
 "clarification":"câu hỏi làm rõ ngắn nếu clarify, ngược lại null","reason":"lý do ngắn"}
Chỉ điền days/minutes_per_day khi người dùng NÓI RÕ con số; không tự đoán."""

ASSISTANTS = ("academic", "learning", "hub", "clarify")
ACTIONS = ("explain", "analogy", "quiz", "diagnose", "flashcards", "cloze", "triage", "plan")
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


def _course_prompt(state: OrchestratorState) -> str:
    lines = [f"- {cid}: {name}" for cid, name in state["courses"]]
    prev = state.get("previous_course_id") or "không có"
    return "DANH SÁCH MÔN ĐƯỢC PHÉP:\n" + "\n".join(lines) + f"\nMÔN LƯỢT TRƯỚC: {prev}"


def _ask_course(state: OrchestratorState) -> str:
    return "Câu hỏi của bạn thuộc môn nào: " + ", ".join(name for _, name in state["courses"]) + "?"


def router_node(state: OrchestratorState) -> dict[str, Any]:
    allowed = {cid for cid, _ in state["courses"]}
    single = next(iter(allowed)) if len(allowed) == 1 else None
    manual = state.get("mode", "auto") != "auto"
    if manual and single:  # đã biết trợ lý và chỉ có một môn → không cần gọi LLM
        return _manual(state, single, "người dùng chọn trợ lý; chỉ có một môn")

    data = call_json(
        ROUTER_SYSTEM,
        f"{_course_prompt(state)}\nNGỮ CẢNH GẦN NHẤT:\n{format_history(state.get('history', []))}"
        f"\n\nYÊU CẦU MỚI: {state['question']}",
        temperature=0,
    )
    course_id = data.get("course_id") if data.get("course_id") in allowed else None
    course_id = course_id or single  # chỉ một môn: không cần hỏi lại
    if manual:
        return _manual(state, course_id, "người dùng chọn trợ lý")
    assistant = data.get("assistant") if data.get("assistant") in ASSISTANTS else "clarify"
    route: RouteDecision = {
        "course_id": course_id,
        "assistant": assistant,
        "learning_action": data.get("learning_action") if data.get("learning_action") in ACTIONS else None,
        "level": data.get("level") if data.get("level") in LEVELS else None,
        "goal": (str(data["goal"]).strip() or None) if data.get("goal") else None,
        "topic": (str(data["topic"]).strip() or None) if data.get("topic") else None,
        "search_terms": str(data.get("search_terms") or "").strip()[:200] or None,
        "analogy_context": (str(data["analogy_context"]).strip()[:120] or None)
        if data.get("analogy_context")
        else None,
        "days": _int(data.get("days")),
        "minutes_per_day": _int(data.get("minutes_per_day")),
        "clarification": (str(data["clarification"]).strip() or None) if data.get("clarification") else None,
        "reason": str(data.get("reason") or "")[:300],
    }
    if assistant == "learning" and route["learning_action"] is None:
        route["learning_action"] = "explain"
    if course_id is None and assistant != "clarify":
        # BR-02/FR-01.3: chưa xác định được môn thì không truy xuất; hỏi người dùng
        route["assistant"], route["clarification"] = "clarify", _ask_course(state)
    return {"route": route, "course_id": course_id, "steps": _step(state, f"router:{route['assistant']}@{course_id}")}


def _manual(state: OrchestratorState, course_id: str | None, reason: str) -> dict[str, Any]:
    """Ép trợ lý qua API (FR-11.5): vẫn qua policy và vẫn phải chốt môn (AC-11.4)."""
    opts = state.get("options") or {}
    route: RouteDecision = {"course_id": course_id, "assistant": state["mode"], "reason": reason}  # type: ignore[typeddict-item]
    if state["mode"] == "learning":
        route["learning_action"] = opts.get("action") if opts.get("action") in ACTIONS else "explain"
    if course_id is None:
        route["assistant"], route["clarification"] = "clarify", _ask_course(state)
    return {"route": route, "course_id": course_id, "steps": _step(state, f"manual:{route['assistant']}@{course_id}")}


def clarify_node(state: OrchestratorState) -> dict[str, Any]:
    question = state["route"].get("clarification") or (
        "Bạn muốn mình trả lời câu hỏi kiến thức, giải thích/lập lộ trình học, hay tìm tài liệu?"
    )
    return {"result": AssistantResult(status="needs_clarification", content=question), "steps": _step(state, "clarify")}


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
    )  # fmt: skip
    return {"result": result, "steps": _step(state, "academic")}


def hub_node(state: OrchestratorState, config: RunnableConfig) -> dict[str, Any]:
    d = _deps(config)
    return {"result": hub.find(d["db"], d["user"], state["course_id"], state["question"]), "steps": _step(state, "hub")}


def learning_node(state: OrchestratorState, config: RunnableConfig) -> dict[str, Any]:
    d = _deps(config)
    db, user, course_id = d["db"], d["user"], state["course_id"]
    route, opts = state["route"], state.get("options") or {}
    action = route.get("learning_action") or "explain"
    question = state["question"]

    # topic: chủ đề hiển thị/đưa vào prompt; query: topic + thuật ngữ router rút ra, CHỈ dùng để truy xuất
    topic = opts.get("topic") or route.get("topic") or question
    query = _retrieval_query(topic, route)
    if action == "quiz":
        result = learning.quiz(db, user, course_id, topic, query)
    elif action == "diagnose":
        result = study_tools.diagnose(db, user, course_id, topic, query)
    elif action in ("flashcards", "cloze"):
        result = study_tools.flashcards(db, user, course_id, topic, action, query)
    elif action == "triage":
        result = study_tools.triage(db, user, course_id, topic, query)
    elif action == "analogy":
        result = study_tools.analogy(
            db, user, course_id, question, state.get("history", []), route.get("analogy_context"), query
        )
    elif action == "plan":
        previous = None
        if opts.get("previous_plan_id"):
            previous = db.get(StudyPlan, opts["previous_plan_id"])
            if previous is None or previous.owner_id != user.id:
                raise not_found()
        goal = opts.get("goal") or route.get("goal") or question
        days = _int(opts.get("days")) or route.get("days")
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
            }
    else:
        level = opts.get("level") or route.get("level")
        result = learning.explain(
            db, user, course_id, question, state.get("history", []), level, _retrieval_query(question, route)
        )
    return {"result": result, "steps": _step(state, f"learning:{action}")}
