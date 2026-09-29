"""Academic Assistant (FR-02, FR-10; PRD 10.1 bước 5–10).

Evidence gate trước khi gọi LLM: không có đoạn nào vượt ngưỡng → insufficient_evidence, không sinh nội dung.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import User
from src.services.assistants import (
    BASE_POLICY,
    AssistantResult,
    call_json,
    format_history,
    format_sources,
    json_list,
    supporting_quotes,
    validate_citations,
)
from src.services.policy import INSUFFICIENT_MESSAGE, SOURCE_WITHDRAWN_MESSAGE
from src.services.retrieval import Hit, search

ALLOWED = ("answered", "partial", "needs_clarification", "insufficient_evidence")

INSTRUCTION = """Trả lời CÂU HỎI chỉ dựa trên NGUỒN. Trả về DUY NHẤT một object JSON:
{"status": "answered" | "partial" | "needs_clarification" | "insufficient_evidence",
 "answer": "câu trả lời có [n] sau từng ý (rỗng nếu needs_clarification/insufficient_evidence)",
 "missing": ["phần câu hỏi chưa có căn cứ trong nguồn"],
 "quotes": {"n": "câu chép NGUYÊN VĂN (không dịch, ≤300 ký tự) từ NGUỒN n chứng minh ý gắn [n]"},
 "clarification": "câu hỏi làm rõ ngắn (chỉ khi needs_clarification)"}
- "partial": chỉ một số phần có căn cứ — liệt kê phần thiếu trong "missing".
- "needs_clarification": câu hỏi mơ hồ về phạm vi/chủ thể/viết tắt.
- "insufficient_evidence": nguồn không đủ để trả lời."""


def evidence(db: Session, user: User, course_id: str, query: str) -> list[Hit]:
    hits = search(db, user, course_id, query)
    return [h for h in hits if h.score >= get_settings().retrieval_min_score]


def answer(
    db: Session,
    user: User,
    course_id: str,
    question: str,
    history: list[tuple[str, str]],
    style: str | None = None,
    retrieval_query: str | None = None,
) -> AssistantResult:
    hits = evidence(db, user, course_id, retrieval_query or question)
    if not hits:
        return AssistantResult(status="insufficient_evidence", content=INSUFFICIENT_MESSAGE)
    style_line = f"\nMức giải thích yêu cầu: {style}." if style else ""
    data = call_json(
        BASE_POLICY,
        f"{INSTRUCTION}{style_line}\n\nLỊCH SỬ (chỉ để hiểu ngữ cảnh, KHÔNG phải nguồn):\n{format_history(history)}"
        f"\n\nNGUỒN:\n{format_sources(hits)}\n\nCÂU HỎI: {question}",
    )
    status = data.get("status") if data.get("status") in ALLOWED else "insufficient_evidence"
    if status == "needs_clarification":
        return AssistantResult(
            status=status, content=str(data.get("clarification") or "Bạn có thể nói rõ hơn phạm vi?")
        )
    if status == "insufficient_evidence":
        return AssistantResult(status=status, content=INSUFFICIENT_MESSAGE)

    text, used, dropped = validate_citations(db, user, str(data.get("answer") or ""), hits)
    if not used:
        # FR-10.3: không có citation hợp lệ → không trình bày như câu trả lời có căn cứ
        return AssistantResult(
            status="insufficient_evidence", content=SOURCE_WITHDRAWN_MESSAGE if dropped else INSUFFICIENT_MESSAGE
        )
    missing = [str(m) for m in json_list(data, "missing") if str(m).strip()]
    if dropped and status == "answered":
        status = "partial"
    if missing:
        status = "partial"
        text += "\n\nChưa đủ căn cứ cho: " + "; ".join(missing) + ". " + INSUFFICIENT_MESSAGE
    quotes = supporting_quotes(text, used, data.get("quotes"))
    return AssistantResult(status=status, content=text, used=used, payload={"missing": missing}, quotes=quotes)
