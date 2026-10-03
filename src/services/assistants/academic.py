"""Academic Assistant: retrieval gate → structured claims → grounding gate.

BL-18/21 · FR-02/10 · BR-04/05. No word-overlap citation restoration or
free-text answer fallback: only claims with verified supporting evidence ship.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar

from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import User
from src.services.assistants import BASE_POLICY, AssistantResult, call_json, format_history, format_sources
from src.services.assistants.grounding import authorized_hits, check_claims, render_claims
from src.services.policy import INSUFFICIENT_MESSAGE
from src.services.retrieval import Hit, search

ALLOWED = ("answered", "partial", "needs_clarification", "insufficient_evidence")

INSTRUCTION = """Trả lời CÂU HỎI chỉ dựa trên NGUỒN. Trả DUY NHẤT một object JSON:
{"status":"answered" | "partial" | "needs_clarification" | "insufficient_evidence",
 "claims":[{"claim":"một ý học thuật ngắn, bằng tiếng Việt, KHÔNG gắn marker [n]",
            "source_refs":[1],
            "supporting_quote":{"1":"đoạn NGUYÊN VĂN 20–400 ký tự từ nguồn 1 hỗ trợ đầy đủ ý này"}}],
 "missing":["phần câu hỏi chưa có căn cứ"]}
- Tối đa 24 claims. Mỗi claim chỉ một ý, không gộp ý chưa có chứng minh vào ý có nguồn.
- Mỗi source_ref phải có supporting_quote riêng thực sự hỗ trợ claim, không chỉ chung thuật ngữ/chủ đề.
- Giữ đúng phủ định, điều kiện, số liệu, đơn vị, phạm vi; không nâng tương quan thành quan hệ nhân quả.
- Có thể dịch/diễn đạt lại claim, nhưng quote giữ NGUYÊN VĂN, gồm cả điều kiện giới hạn liên quan.
- Nếu nguồn mâu thuẫn, nêu rõ khác biệt/phạm vi trong claim và dẫn đủ nguồn của hai phía.
- Suy luận phải được nêu là suy luận và có đầy đủ tiền đề từ nguồn; không bổ sung kiến thức ngoài.
- Không trả answer tự do. Không tự gắn citation hay thêm lời mở đầu/kết luận ngoài claims.
- partial: chỉ trả claims có căn cứ. needs_clarification/insufficient_evidence: claims rỗng.
- insufficient_evidence chỉ khi không nguồn nào nói về điều được hỏi; nguồn mô tả trực tiếp dù bằng tiếng Anh
  hoặc chỉ hỗ trợ một phần thì dùng answered/partial với claims được nguồn chứng minh."""

_topic_queries: ContextVar[list[str] | None] = ContextVar("topic_queries", default=None)


@contextmanager
def multi_topic(queries: list[str] | None):
    """Retrieve independently per topic, then interleave (D-51)."""
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
    k = max(1, round(get_settings().retrieval_top_k * 1.5 / len(queries)))
    per_topic = [[h for h in search(db, user, course_id, q, k) if h.score >= floor] for q in queries]
    merged, seen = [], set()
    for rank in range(k):
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
    hits = authorized_hits(db, user, evidence(db, user, course_id, retrieval_query or question))
    if not hits:
        return AssistantResult(status="insufficient_evidence", content=INSUFFICIENT_MESSAGE)
    style_line = f"\nMức giải thích yêu cầu: {style}." if style else ""
    data = call_json(
        BASE_POLICY,
        f"{INSTRUCTION}{style_line}\n\nLỊCH SỬ (chỉ để hiểu ngữ cảnh, KHÔNG phải nguồn):\n{format_history(history)}"
        f"\n\nNGUỒN:\n{format_sources(hits, retrieval_query or question)}\n\nCÂU HỎI: {question}",
        temperature=0,
    )
    status = data.get("status") if data.get("status") in ALLOWED else "insufficient_evidence"
    if status == "needs_clarification":
        # Do not let arbitrary unverified assertions escape in a clarification field.
        return AssistantResult(status=status, content="Bạn có thể nói rõ hơn phạm vi hoặc khái niệm muốn hỏi?")
    if status == "insufficient_evidence":
        return AssistantResult(status=status, content=INSUFFICIENT_MESSAGE)
    claims, counts = check_claims(db, user, data.get("claims"), hits)
    if not claims:
        return AssistantResult(
            status="insufficient_evidence", content=INSUFFICIENT_MESSAGE, payload={"grounding": counts}
        )
    text, used, proof, quotes = render_claims(claims, hits)
    if counts["removed"] or data.get("missing") or status == "partial":
        status = "partial"
        # No free-text missing/reviewer prose is appended to the verified claims.
        text += "\n\nMột số phần chưa đủ căn cứ từ tài liệu hiện có."
    return AssistantResult(
        status=status,
        content=text,
        used=used,
        payload={"grounding": counts, "evidence": proof},
        quotes=quotes,
    )
