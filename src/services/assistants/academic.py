"""Academic Assistant (FR-02, FR-10; PRD 10.1 bước 5–10).

Evidence gate trước khi gọi LLM: không có đoạn nào vượt ngưỡng → insufficient_evidence, không sinh nội dung.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar

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


_topic_queries: ContextVar[list[str] | None] = ContextVar("topic_queries", default=None)


@contextmanager
def multi_topic(queries: list[str] | None):
    """Ôn tập nhiều chủ đề (D-51): trong khối này, evidence() truy xuất RIÊNG từng chủ đề rồi gộp xen kẽ, để nguồn
    (và câu hỏi) trải đều các chủ đề thay vì dồn vào chủ đề gần câu truy vấn gộp nhất. Mỗi chủ đề 1 embedding truy vấn."""
    token = _topic_queries.set(queries if queries and len(queries) > 1 else None)
    try:
        yield
    finally:
        _topic_queries.reset(token)


def evidence(db: Session, user: User, course_id: str, query: str) -> list[Hit]:
    floor = get_settings().retrieval_min_score
    queries = _topic_queries.get()
    if not queries:
        return [h for h in search(db, user, course_id, query) if h.score >= floor]
    # ít chủ đề → vài đoạn mỗi chủ đề; nhiều chủ đề (lộ trình cả môn) → ít nhất 1 đoạn mỗi chủ đề, prompt không phình
    k = max(1, round(get_settings().retrieval_top_k * 1.5 / len(queries)))
    per_topic = [[h for h in search(db, user, course_id, q, k) if h.score >= floor] for q in queries]
    merged, seen = [], set()
    for rank in range(k):  # xen kẽ: hạng 1 của mọi chủ đề, rồi hạng 2… — không chủ đề nào bị lấn át
        for hits in per_topic:
            if rank < len(hits) and hits[rank].chunk.id not in seen:
                seen.add(hits[rank].chunk.id)
                merged.append(hits[rank])
    return merged


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
