"""Learning Assistant (FR-03): giải thích theo mức, tự kiểm tra, đánh giá mức hiểu, lộ trình học.

Ràng buộc quỹ thời gian được kiểm tra bằng code, không tin LLM (AC-03.4); vượt quỹ → báo quá tải,
chờ Sinh viên chọn (FR-03.8), không âm thầm cắt bớt.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import StudyPlan, User
from src.services.assistants import BASE_POLICY, AssistantResult, call_json, format_sources
from src.services.assistants.academic import answer as academic_answer
from src.services.assistants.academic import evidence
from src.services.policy import INSUFFICIENT_MESSAGE
from src.services.retrieval import Hit, still_servable

LEVELS = {"short": "ngắn gọn", "step": "từng bước", "detailed": "chi tiết"}
UNDERSTANDING = ("solid", "needs_reinforcement", "missing_foundation", "insufficient_data")
OVERLOAD_MESSAGE = (
    "Nội dung bạn chọn cần nhiều thời gian hơn quỹ thời gian đã nhập. "
    "Bạn muốn giảm bớt chủ đề hay tăng thời lượng mỗi ngày?"
)


def explain(
    db: Session, user: User, course_id: str, question: str, history: list, level: str | None
) -> AssistantResult:
    """FR-03.1: giải thích theo mức; ví dụ tự tạo phải được đánh dấu là minh họa."""
    style = (
        LEVELS.get(level or "step", "từng bước")
        + "; ví dụ minh họa tự tạo phải ghi rõ 'Ví dụ minh họa (không trích nguyên văn)'"
    )
    result = academic_answer(db, user, course_id, question, history, style=style)
    result.payload["kind"] = "explain"
    return result


def _source_refs(raw: Any, hits: list[Hit], db: Session, user: User) -> list[int]:
    refs = []
    for n in raw if isinstance(raw, list) else [raw]:
        try:
            n = int(n)
        except (TypeError, ValueError):
            continue
        if 1 <= n <= len(hits) and still_servable(db, user, hits[n - 1].version.id) and n not in refs:
            refs.append(n)
    return refs


def quiz(db: Session, user: User, course_id: str, topic: str) -> AssistantResult:
    """FR-03.2: câu tự kiểm tra lấy từ nguồn hợp lệ, mỗi câu có chủ đề, mục tiêu và nguồn."""
    hits = evidence(db, user, course_id, topic)
    if not hits:
        return AssistantResult(status="insufficient_evidence", content=INSUFFICIENT_MESSAGE, payload={"kind": "quiz"})
    n = get_settings().learning_quiz_questions
    data = call_json(
        BASE_POLICY,
        f"Tạo {n} câu hỏi tự kiểm tra ngắn (không phải bài tính điểm) về CHỦ ĐỀ, chỉ dựa trên NGUỒN. "
        'Trả về JSON {"questions":[{"topic":"...","objective":"mục tiêu kiểm tra","question":"...","source":n}]}. '
        f"KHÔNG kèm đáp án.\n\nNGUỒN:\n{format_sources(hits)}\n\nCHỦ ĐỀ: {topic}",
        temperature=0.3,
    )
    questions, used_n = [], set()
    for i, q in enumerate(data.get("questions") or [], start=1):
        refs = _source_refs(q.get("source"), hits, db, user)
        if not refs or not str(q.get("question") or "").strip():
            continue  # câu không có nguồn hợp lệ bị loại, không trình bày
        used_n.update(refs)
        questions.append(
            {
                "id": f"q{i}",
                "topic": str(q.get("topic") or topic)[:200],
                "objective": str(q.get("objective") or "")[:300],
                "question": str(q["question"])[:1000],
                "sources": refs,
            }
        )
    if not questions:
        return AssistantResult(status="insufficient_evidence", content=INSUFFICIENT_MESSAGE, payload={"kind": "quiz"})
    used = [(k, hits[k - 1]) for k in sorted(used_n)]
    return AssistantResult(
        status="answered",
        content=f"Trả lời {len(questions)} câu tự kiểm tra để mình biết bạn đang ở đâu. Có thể lưu tạm và tiếp tục sau.",
        used=used,
        payload={"kind": "quiz", "topic": topic, "questions": questions, "answers": {}, "assessment": None},
    )


def assess(questions: list[dict], answers: dict[str, str], sources_text: str) -> dict[str, Any]:
    """FR-03.4: phân loại theo chủ đề; câu chưa trả lời → chưa đủ dữ liệu (AC-03.2). Không đưa lời giải (BR-06)."""
    answered = [q for q in questions if (answers.get(q["id"]) or "").strip()]
    result: dict[str, Any] = {"topics": [], "unanswered": [q["id"] for q in questions if q not in answered]}
    if answered:
        payload = "\n".join(
            f"- [{q['id']}] Chủ đề: {q['topic']} | Câu hỏi: {q['question']} | Trả lời: {answers[q['id']]}"
            for q in answered
        )
        data = call_json(
            BASE_POLICY,
            "Đánh giá mức hiểu theo TỪNG CHỦ ĐỀ dựa trên câu trả lời của Sinh viên và NGUỒN. Không đưa đáp án hoàn chỉnh, "
            "chỉ nêu ý cần xem lại. Trả về JSON "
            '{"topics":[{"topic":"...","level":"solid|needs_reinforcement|missing_foundation|insufficient_data",'
            '"rationale":"căn cứ ngắn","review":"ý cần xem lại"}]}'
            f"\n\nNGUỒN:\n{sources_text}\n\nCÂU TRẢ LỜI:\n{payload}",
        )
        for t in data.get("topics") or []:
            level = t.get("level") if t.get("level") in UNDERSTANDING else "insufficient_data"
            result["topics"].append(
                {
                    "topic": str(t.get("topic"))[:200],
                    "level": level,
                    "rationale": str(t.get("rationale") or "")[:600],
                    "review": str(t.get("review") or "")[:600],
                }
            )
    for q in questions:
        if q["id"] in result["unanswered"]:
            result["topics"].append(
                {"topic": q["topic"], "level": "insufficient_data", "rationale": "Chưa trả lời", "review": ""}
            )
    return result


def plan(
    db: Session,
    user: User,
    course_id: str,
    goal: str | None,
    days: int | None,
    minutes: int | None,
    previous: StudyPlan | None,
) -> tuple[AssistantResult, dict | None]:
    """FR-03.5–03.9: trả (kết quả, dữ liệu kế hoạch Draft nếu hợp lệ)."""
    missing = [
        name
        for name, v in (("mục tiêu/chủ đề", goal), ("số ngày", days), ("thời lượng mỗi ngày (phút)", minutes))
        if not v
    ]
    if missing:  # AC-03.1
        return AssistantResult(
            status="needs_clarification", content="Cần thêm: " + ", ".join(missing) + ".", payload={"kind": "plan"}
        ), None
    assert goal and days and minutes
    if days <= 0 or minutes <= 0 or days > 60 or minutes > 600:
        return AssistantResult(
            status="needs_clarification",
            content="Số ngày và thời lượng phải là số dương hợp lệ.",
            payload={"kind": "plan"},
        ), None
    hits = evidence(db, user, course_id, goal)
    if not hits:
        return AssistantResult(
            status="insufficient_evidence", content=INSUFFICIENT_MESSAGE, payload={"kind": "plan"}
        ), None
    prev_note = ""
    if previous is not None:
        prev_note = (
            f"\nĐây là bản điều chỉnh của kế hoạch trước (mục tiêu: {previous.goal}); giữ các buổi đã hoàn thành."
        )
    data = call_json(
        BASE_POLICY,
        "Lập lộ trình học chỉ dựa trên NGUỒN. Ưu tiên nền tảng trước phần phụ thuộc. Trả về JSON "
        '{"feasible":true|false,"sessions":[{"day":1,"title":"...","objective":"...","minutes":45,'
        '"activity":"đọc/làm ví dụ...","self_check":"cách tự kiểm tra","sources":[n]}],'
        '"uncovered":["chủ đề thiếu nguồn"]}. '
        f"Ràng buộc: {days} ngày, mỗi ngày tổng phút KHÔNG vượt {minutes}. Nếu không đủ thời gian, feasible=false."
        f"{prev_note}\n\nNGUỒN:\n{format_sources(hits)}\n\nMỤC TIÊU: {goal}",
        temperature=0.3,
    )
    sessions, used_n, warnings = [], set(), []
    per_day: dict[int, int] = {}
    for s in data.get("sessions") or []:
        try:
            day, mins = int(s.get("day")), int(s.get("minutes"))
        except (TypeError, ValueError):
            continue
        if not 1 <= day <= days or mins <= 0:
            continue
        refs = _source_refs(s.get("sources"), hits, db, user)
        used_n.update(refs)
        per_day[day] = per_day.get(day, 0) + mins
        sessions.append(
            {
                "id": f"s{len(sessions) + 1}",
                "day": day,
                "title": str(s.get("title") or "")[:200],
                "objective": str(s.get("objective") or "")[:400],
                "minutes": mins,
                "activity": str(s.get("activity") or "")[:400],
                "self_check": str(s.get("self_check") or "")[:400],
                "sources": refs,
                "missing_source": not refs,
                "status": "not_started",
            }
        )
    over = {d: m for d, m in per_day.items() if m > minutes}
    if data.get("feasible") is False or over or not sessions:  # AC-03.4, FR-03.8
        return AssistantResult(
            status="needs_clarification", content=OVERLOAD_MESSAGE, payload={"kind": "plan", "overload": over}
        ), None
    uncovered = [str(u) for u in data.get("uncovered") or [] if str(u).strip()]
    if uncovered:
        warnings.append("Thiếu nguồn cho: " + "; ".join(uncovered))
    if any(s["missing_source"] for s in sessions):
        warnings.append("Một số buổi chưa có nguồn hợp lệ — cần xác nhận trước khi thực hiện.")
    plan_data = {
        "sessions": sessions,
        "warnings": warnings,
        "total_minutes": sum(per_day.values()),
        "budget_minutes": days * minutes,
    }
    used = [(k, hits[k - 1]) for k in sorted(used_n)]
    content = (
        f"Đề xuất lộ trình {days} ngày (Draft) — tổng {plan_data['total_minutes']}/{days * minutes} phút cho phép. "
        "Xem lại và xác nhận trước khi bắt đầu."
    )
    return AssistantResult(
        status="partial" if warnings else "answered", content=content, used=used, payload={"kind": "plan"}
    ), plan_data
