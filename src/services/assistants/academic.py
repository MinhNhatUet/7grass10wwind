"""Academic Assistant: retrieval gate → structured claims → grounding gate.

BL-18/21 · FR-02/10 · BR-04/05. No word-overlap citation restoration or
free-text answer fallback: only claims with verified supporting evidence ship.
"""

from __future__ import annotations

import re
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
 "claims":[{"claim":"một câu học thuật hoàn chỉnh, bằng tiếng Việt, KHÔNG gắn marker [n]","para":1,
            "source_refs":[1],
            "supporting_quote":{"1":"đoạn NGUYÊN VĂN 20–400 ký tự từ nguồn 1 hỗ trợ đầy đủ ý này"}}],
 "missing":["phần câu hỏi chưa có căn cứ"]}
- Các claims ghép lại phải đọc như MỘT CÂU TRẢ LỜI HOÀN CHỈNH, mạch lạc như giảng viên giải thích (không phải gạch
  đầu dòng): claim đầu trả lời thẳng câu hỏi; các claim sau giải thích, so sánh, nêu ví dụ theo trình tự hợp lý; mỗi
  claim là một câu trọn vẹn, được dùng từ nối ("Ngoài ra", "Trong khi đó", "Vì vậy" — chỉ khi nguồn cho phép quan hệ đó).
- "para": số thứ tự đoạn văn (1, 2, …): claims cùng một ý lớn chung đoạn; câu hỏi so sánh A với B → đoạn A, đoạn B,
  đoạn so sánh. Câu hỏi ngắn → 1–2 đoạn.
- Trả lời ĐẦY ĐỦ những gì NGUỒN có về câu hỏi ("gồm những gì / loại, vai trò, giai đoạn, nguyên tắc nào / ưu nhược
  điểm / khác nhau thế nào"): nêu đủ các mục nguồn có. Danh sách nằm LIỀN trong nguồn → gộp vào một câu ("gồm 5 giai
  đoạn: …") với một quote liền mạch; mục cần giải thích riêng thì mỗi mục một câu.
- Tối đa 24 claims. Mỗi claim không gộp ý chưa có chứng minh vào ý có nguồn.
- Mỗi source_ref phải có supporting_quote riêng thực sự hỗ trợ claim, không chỉ chung thuật ngữ/chủ đề.
- Giữ đúng phủ định, điều kiện, số liệu, đơn vị, phạm vi; không nâng tương quan thành quan hệ nhân quả.
- Có thể dịch/diễn đạt lại claim, nhưng quote giữ NGUYÊN VĂN, gồm cả điều kiện giới hạn liên quan.
- supporting_quote là MỘT đoạn LIỀN MẠCH chép từ nguồn — không ghép các dòng không liền nhau; cần nhiều đoạn thì tách
  thành nhiều claim. Claim diễn đạt SÁT quote: không thêm đánh giá ("cần thiết", "quan trọng nhất"…), hành động hay
  điều kiện mà quote không ghi; quote nói "bảo trì TỐT đảm bảo…" thì claim giữ chữ "tốt".
- Nếu nguồn mâu thuẫn, nêu rõ khác biệt/phạm vi trong claim và dẫn đủ nguồn của hai phía.
- Suy luận phải được nêu là suy luận và có đầy đủ tiền đề từ nguồn; không bổ sung kiến thức ngoài.
- Không trả answer tự do. Không tự gắn citation hay thêm lời mở đầu/kết luận ngoài claims.
- partial: chỉ trả claims có căn cứ. needs_clarification/insufficient_evidence: claims rỗng.
- insufficient_evidence chỉ khi không nguồn nào nói về điều được hỏi; nguồn mô tả trực tiếp dù bằng tiếng Anh
  hoặc chỉ hỗ trợ một phần thì dùng answered/partial với claims được nguồn chứng minh.
- Tài liệu môn là chuẩn của môn: claims đã trả lời trực tiếp câu hỏi bằng nội dung tài liệu → "answered"; KHÔNG
  đánh "partial" chỉ vì tài liệu không có "định nghĩa tổng quát" hay chi tiết ngoài điều được hỏi. "partial" khi
  một PHẦN của câu hỏi không có căn cứ (vd hỏi 3 vai trò, nguồn chỉ nêu 1) — ghi phần đó vào "missing".
- Công thức/định lý TỔNG QUÁT mà NGUỒN chỉ có trường hợp riêng hoặc một ví dụ áp dụng → "partial": claim nói rõ đó là
  trường hợp riêng/ví dụ trong ngữ cảnh nào của tài liệu; đưa dạng tổng quát vào "missing" (BR-05)."""

_topic_queries: ContextVar[list[str] | None] = ContextVar("topic_queries", default=None)


@contextmanager
def multi_topic(queries: list[str] | None):
    """Retrieve independently per topic, then interleave (D-51)."""
    token = _topic_queries.set(queries if queries and len(queries) > 1 else None)
    try:
        yield
    finally:
        _topic_queries.reset(token)


def selected_topics() -> list[str]:
    """Mô tả các bài/chủ đề của lượt ôn nhiều bài đang chạy ([] = ôn một chủ đề)."""
    return list(_topic_queries.get() or [])


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


def evidence_multi(db: Session, user: User, course_id: str, question: str, search_terms: str | None) -> list[Hit]:
    """Câu hỏi + thuật ngữ router rút ra + riêng phần tiếng Anh, tìm RIÊNG từng truy vấn rồi gộp (điểm cao nhất mỗi
    chunk). Slide nhiều môn viết tiếng Anh: câu hỏi tiếng Việt lẫn thuật ngữ làm loãng embedding (coupling: 0.48 khi
    trộn, 0.80 khi tìm "coupling cohesion"). Ngưỡng bằng chứng giữ nguyên (Q-17)."""
    english = " ".join(re.findall(r"\b(?:[A-Z]{2,}|[A-Za-z][A-Za-z-]{3,})\b", search_terms or ""))
    best: dict[str, Hit] = {}
    for q in dict.fromkeys(q.strip() for q in (question, search_terms or "", english) if q.strip()):
        for h in evidence(db, user, course_id, q):
            if h.chunk.id not in best or h.score > best[h.chunk.id].score:
                best[h.chunk.id] = h
    return sorted(best.values(), key=lambda h: h.score, reverse=True)[: get_settings().retrieval_top_k]


CLARIFY_MESSAGE = "Bạn có thể nói rõ hơn phạm vi hoặc khái niệm muốn hỏi? Chọn một bài của môn bên dưới hoặc gõ thêm."
NO_MORE_CLARIFY = (
    "\n\nNgười dùng VỪA trả lời câu hỏi làm rõ của trợ lý (xem LỊCH SỬ). KHÔNG được trả needs_clarification nữa: "
    "trả lời tổng quan các ý chính mà NGUỒN có về phạm vi người dùng đã chọn."
)


def _lesson_choices(db: Session, user: User, course_id: str, question: str) -> list[dict[str, str]]:
    """Nút cho câu hỏi chưa rõ phạm vi: các bài trong chương trình học của môn (đã lưu sẵn, không gọi LLM)."""
    from src.services.learning_path.curriculum import load_curriculum

    try:
        lessons = load_curriculum(db, user, course_id).lessons
    except Exception:  # noqa: BLE001 — chỉ là gợi ý; lỗi thì không hiện nút
        return []
    return [
        {"label": f"Bài {x.order}: {x.title}", "send": f"Giải thích các ý chính của Bài {x.order}: {x.title}"}
        for x in lessons[:8]
    ]


def answer(
    db: Session,
    user: User,
    course_id: str,
    question: str,
    history: list[tuple[str, str]],
    style: str | None = None,
    retrieval_query: str | None = None,
    search_terms: str | None = None,
) -> AssistantResult:
    hits = authorized_hits(db, user, evidence_multi(db, user, course_id, retrieval_query or question, search_terms))
    if not hits:
        return AssistantResult(status="insufficient_evidence", content=INSUFFICIENT_MESSAGE)
    style_line = f"\nMức giải thích yêu cầu: {style}." if style else ""
    prompt = (
        f"{INSTRUCTION}{style_line}\n\nLỊCH SỬ (chỉ để hiểu ngữ cảnh, KHÔNG phải nguồn):\n{format_history(history)}"
        f"\n\nNGUỒN:\n{format_sources(hits, retrieval_query or question)}\n\nCÂU HỎI: {question}"
    )
    data = call_json(BASE_POLICY, prompt, temperature=0)
    status = data.get("status") if data.get("status") in ALLOWED else "insufficient_evidence"
    if status == "needs_clarification" and history and history[-1][0] != "user" and history[-1][1] == CLARIFY_MESSAGE:
        # Vừa hỏi lại, người dùng đã chọn/bổ sung phạm vi → không hỏi lại lần nữa (tránh vòng lặp nút bấm)
        data = call_json(BASE_POLICY, prompt + NO_MORE_CLARIFY, temperature=0)
        status = data.get("status") if data.get("status") in ALLOWED else "insufficient_evidence"
        if status == "needs_clarification":
            status = "insufficient_evidence"
    if status == "needs_clarification":
        # Do not let arbitrary unverified assertions escape in a clarification field.
        return AssistantResult(
            status=status,
            content=CLARIFY_MESSAGE,
            payload={"choices": _lesson_choices(db, user, course_id, question)},
        )
    if status == "insufficient_evidence":
        return AssistantResult(status=status, content=INSUFFICIENT_MESSAGE)
    claims, counts = check_claims(db, user, data.get("claims"), hits)
    if not claims:
        return AssistantResult(
            status="insufficient_evidence", content=INSUFFICIENT_MESSAGE, payload={"grounding": counts}
        )
    text, used, proof, quotes = render_claims(claims, hits)
    # Cổng loại vài claim lẻ mà phần còn lại vẫn trả lời đủ (model tự đánh answered, không khai thiếu) → giữ answered;
    # chỉ hạ partial khi model khai thiếu, tự đánh partial, hoặc cổng loại đáng kể (> 1/3, còn < 2 claim).
    heavy_loss = counts["removed"] * 3 > counts["proposed"] or len(claims) < 2
    if data.get("missing") or status == "partial" or (counts["removed"] and heavy_loss):
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
