"""Academic Assistant (FR-02, FR-10; PRD 10.1 bước 5–10).

Evidence gate trước khi gọi LLM: không có đoạn nào vượt ngưỡng → insufficient_evidence, không sinh nội dung.
"""

from __future__ import annotations

import re
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import User
from src.services.assistants import (
    BASE_POLICY,
    CITATION_RE,
    AssistantResult,
    call_json,
    format_history,
    format_sources,
    join_sentences,
    json_list,
    mark_uncited,
    split_sentences,
    supporting_quotes,
    unlabel_unsupported,
    validate_citations,
)
from src.services.policy import INSUFFICIENT_MESSAGE, SOURCE_WITHDRAWN_MESSAGE
from src.services.retrieval import Hit, search

ALLOWED = ("answered", "partial", "needs_clarification", "insufficient_evidence")

INSTRUCTION = """Trả lời CÂU HỎI chỉ dựa trên NGUỒN. Trả về DUY NHẤT một object JSON:
{"status": "answered" | "partial" | "needs_clarification" | "insufficient_evidence",
 "answer": "câu trả lời; MỖI câu khẳng định kết thúc bằng [n] (kể cả câu định nghĩa mở đầu) — rỗng nếu needs_clarification/insufficient_evidence",
 "missing": ["phần câu hỏi chưa có căn cứ trong nguồn"],
 "quotes": {"n": "câu chép NGUYÊN VĂN (không dịch, ≤300 ký tự) từ NGUỒN n chứng minh ý gắn [n]"},
 "clarification": "câu hỏi làm rõ ngắn (chỉ khi needs_clarification)"}
- "partial": chỉ một số phần có căn cứ — liệt kê phần thiếu trong "missing".
- "needs_clarification": câu hỏi mơ hồ về phạm vi/chủ thể/viết tắt.
- "insufficient_evidence": CHỈ khi không NGUỒN nào nói về điều được hỏi. Nếu có nguồn định nghĩa/mô tả trực tiếp khái
  niệm được hỏi (kể cả bằng tiếng Anh hoặc chỉ một phần) thì trả lời "answered"/"partial" dựa trên phần đó.
- Hỏi khái niệm/công thức/định lý TỔNG QUÁT mà NGUỒN chỉ có trường hợp riêng hoặc một ví dụ áp dụng (vd nguồn chỉ có
  kết quả cho một hàm cụ thể trong một bài giải) → "partial": nói rõ đó là trường hợp riêng/ví dụ trong ngữ cảnh nào
  của tài liệu, KHÔNG trình bày như câu trả lời cho dạng tổng quát; đưa dạng tổng quát vào "missing"."""


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


def selected_topics() -> list[str]:
    """Mô tả các bài/chủ đề của lượt ôn nhiều bài đang chạy ([] = ôn một chủ đề)."""
    return list(_topic_queries.get() or [])


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


def _restore_citations(answer_text: str, quotes: Any, hits: list[Hit]) -> str:
    """D-72: gpt-4o-mini đôi khi trả lời đúng + trích nguyên văn ở "quotes" nhưng QUÊN gắn [n] → FR-10.3 biến câu trả
    lời thành "không đủ căn cứ". Chỉ khi câu trả lời KHÔNG có [n] nào: gắn [n] cho những nguồn mà câu trích nguyên văn
    (≥ 20 ký tự) có THẬT trong chunk n (server kiểm, không tin model). Không kiểm được → giữ nguyên (vẫn bị từ chối)."""
    if not answer_text.strip() or CITATION_RE.search(answer_text) or not isinstance(quotes, dict):
        return answer_text
    norm = lambda s: re.sub(r"\s+", " ", s).strip().casefold()  # noqa: E731
    found: dict[int, str] = {}
    for key, quote in quotes.items():
        q = norm(str(quote or "").strip().strip('"“”'))
        if (
            str(key).isdigit()
            and 1 <= int(key) <= len(hits)
            and len(q) >= 20
            and q in norm(hits[int(key) - 1].chunk.text)
        ):
            found[int(key)] = q
    if not found:
        return answer_text
    # D-73: gắn [n] vào CÂU khớp nhất với câu trích đã kiểm (âm tiết/thuật ngữ chung, kể cả tên tiếng Anh trong ngoặc),
    # không gắn dồn ở cuối; không câu nào chung từ → câu cuối như trước.
    sents = split_sentences(answer_text)
    idx = [i for i, (s, _) in enumerate(sents) if s.strip()]
    for n, q in sorted(found.items()):
        qw = set(re.findall(r"\w{3,}", q))
        best = max(idx, key=lambda i: (len(qw & set(re.findall(r"\w{3,}", sents[i][0].casefold()))), i))
        s = sents[best][0].rstrip()
        end = len(s) - len(s.rstrip(".!?…"))  # chèn nhãn trước dấu câu cuối
        sents[best][0] = f"{s[: len(s) - end]} [{n}]{s[len(s) - end :]}" if end else f"{s} [{n}]"
    return join_sentences(sents)


def _inherit_labels(text: str, used: dict[int, Hit]) -> str:
    """D-73: model hay chỉ gắn [n] ở câu cuối đoạn. Câu chưa có nhãn nhận nhãn của câu liền kề trong CÙNG đoạn khi
    server kiểm được nội dung câu nằm trong chunk của nguồn đó: trong các từ của câu có mặt ở các nguồn, ≥ 60% (và ≥ 2
    từ) nằm trong chunk của nguồn kề. Không kiểm được → giữ nguyên để mark_uncited đánh dấu (không gắn bừa)."""
    sents = split_sentences(text)
    words = lambda s: set(re.findall(r"\w{3,}", s.casefold()))  # noqa: E731
    chunk_words = {n: words(h.chunk.text) for n, h in used.items()}
    # chỉ xét từ của câu CÓ trong ít nhất một nguồn — câu tiếng Việt / nguồn tiếng Anh vẫn đo được qua thuật ngữ chung
    source_vocab = set().union(*chunk_words.values()) if chunk_words else set()
    for i, (s, _) in enumerate(sents):
        body = s.strip()
        if not body or CITATION_RE.search(body):
            continue
        neighbours = []
        for j in (i + 1, i - 1):  # cùng đoạn: không vượt qua dấu xuống dòng
            if 0 <= j < len(sents) and "\n" not in sents[min(i, j)][1]:
                neighbours += [int(x) for x in CITATION_RE.findall(sents[j][0]) if int(x) in chunk_words]
        sw = words(body) & source_vocab
        for n in dict.fromkeys(neighbours):
            hit = len(sw & chunk_words[n])
            if hit >= 2 and hit / len(sw) >= 0.6:
                end = len(body) - len(body.rstrip(".!?…"))
                sents[i][0] = s.replace(
                    body, f"{body[: len(body) - end]} [{n}]{body[len(body) - end :]}" if end else f"{body} [{n}]"
                )
                break
    return join_sentences(sents)


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
        f"\n\nNGUỒN:\n{format_sources(hits, retrieval_query or question)}\n\nCÂU HỎI: {question}",
        temperature=0,  # D-68: cùng nguồn, cùng câu hỏi → cùng kết luận (gpt-4o-mini lúc trả lời lúc từ chối)
    )
    status = data.get("status") if data.get("status") in ALLOWED else "insufficient_evidence"
    if status == "needs_clarification":
        return AssistantResult(
            status=status, content=str(data.get("clarification") or "Bạn có thể nói rõ hơn phạm vi?")
        )
    if status == "insufficient_evidence":
        return AssistantResult(status=status, content=INSUFFICIENT_MESSAGE)

    answer_text = _restore_citations(str(data.get("answer") or ""), data.get("quotes"), hits)
    text, used, dropped = validate_citations(db, user, answer_text, hits)
    if not used:
        # FR-10.3: không có citation hợp lệ → không trình bày như câu trả lời có căn cứ
        return AssistantResult(
            status="insufficient_evidence", content=SOURCE_WITHDRAWN_MESSAGE if dropped else INSUFFICIENT_MESSAGE
        )
    missing = [str(m) for m in json_list(data, "missing") if str(m).strip()]
    if dropped and status == "answered":
        status = "partial"
    text = unlabel_unsupported(_inherit_labels(text, dict(used)), dict(used))
    used = [(n, h) for n, h in used if f"[{n}]" in text]  # nguồn chỉ còn được câu bịa trỏ tới → không hiện
    if not used:
        return AssistantResult(status="insufficient_evidence", content=INSUFFICIENT_MESSAGE)
    text, uncited = mark_uncited(text)  # D-73 — BR-04: câu khẳng định không có [n] được đánh dấu ngay tại câu
    if uncited and status == "answered":
        status = "partial"
    if missing:
        status = "partial"
        text += "\n\nChưa đủ căn cứ cho: " + "; ".join(missing) + ". " + INSUFFICIENT_MESSAGE
    quotes = supporting_quotes(text, used, data.get("quotes"))
    return AssistantResult(status=status, content=text, used=used, payload={"missing": missing}, quotes=quotes)
