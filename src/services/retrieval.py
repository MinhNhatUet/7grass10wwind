"""Retrieval đúng quyền (BL-15; BR-01, BR-03, BR-13; PRD 10.1 bước 5; D-21).

Thứ tự: xác định tập version được phép bằng SQL + ACL → CHỈ nạp embedding của các version đó →
cosine bằng numpy → top-k. Không bao giờ tính similarity trên toàn kho rồi mới lọc.
"""

from __future__ import annotations

import re
import threading
import time
from collections import OrderedDict
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import PUBLISHED, Chunk, Document, DocumentVersion, User
from src.services import acl

# version_id → (chunk_ids, ma trận đã chuẩn hóa, tập từ của từng chunk — cho điểm khớp từ khóa D-68). LRU có trần:
# version không còn được hỏi (đã thu hồi/lưu trữ) tự rơi khỏi cache thay vì giữ mãi.
_cache: OrderedDict[str, tuple[list[str], np.ndarray, list[set[str]]]] = OrderedDict()
CACHE_MAX_VERSIONS = 256
_WORD = re.compile(r"\w{4,}")
_cache_lock = threading.Lock()
_document_scope: ContextVar[str | None] = ContextVar("document_scope", default=None)


@contextmanager
def document_scope(document_id: str | None):
    """Request-local scope shared by Academic, Learning and Hub retrieval."""
    token = _document_scope.set(document_id)
    try:
        yield
    finally:
        _document_scope.reset(token)


def current_document_scope() -> str | None:
    """Expose the request-local document boundary to retrieval adapters."""
    return _document_scope.get()


class EmbeddingUnavailableError(Exception):
    def __init__(self, rate_limited: bool):
        self.rate_limited = rate_limited
        super().__init__("Embedding provider unavailable")


def to_blob(vec: list[float]) -> bytes:
    arr = np.asarray(vec, dtype=np.float32)
    norm = np.linalg.norm(arr)
    return (arr / norm if norm else arr).tobytes()


def _is_rate_limit(e: Exception) -> bool:
    """Recognize 429 even when the Gemini integration wraps the SDK error."""
    seen: set[int] = set()
    current: BaseException | None = e
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if type(current).__name__ == "RateLimitError":
            return True
        # google.genai ClientError exposes code; OpenAI exposes status_code.
        if any(getattr(current, attr, None) in (429, "429") for attr in ("code", "status_code")):
            return True
        current = current.__cause__ or current.__context__
    return False


def embed_texts(texts: list[str]) -> list[bytes]:
    """Embedding theo lô; gặp giới hạn tần suất (429) thì chờ tăng dần rồi thử lại (NFR-05: chỉ retry lỗi retryable)."""
    from src.services.llm import get_embeddings

    s = get_settings()
    emb = get_embeddings()
    out: list[bytes] = []
    for i in range(0, len(texts), s.embedding_batch_size):
        part = texts[i : i + s.embedding_batch_size]
        for attempt in range(s.embedding_max_retries + 1):
            try:
                out += [to_blob(v) for v in emb.embed_documents(part)]
                break
            except Exception as e:
                if not _is_rate_limit(e) or attempt == s.embedding_max_retries:
                    raise
                time.sleep(min(s.embedding_backoff_seconds * 2**attempt, 120))
        if s.embedding_pause_seconds:
            time.sleep(s.embedding_pause_seconds)  # giãn nhịp giữa các lô để không chạm giới hạn/phút
    return out


def chunk_embedding_text(chunk: Chunk) -> str:
    """Include section hierarchy in embeddings without polluting the source excerpt."""
    text = chunk.text.strip()
    return f"Section: {chunk.section.strip()}\n\n{text}" if chunk.section and chunk.section.strip() else text


def embed_query(text: str) -> np.ndarray:
    from src.services.llm import get_embeddings

    try:
        return np.frombuffer(to_blob(get_embeddings().embed_query(text)), dtype=np.float32)
    except Exception as e:
        raise EmbeddingUnavailableError(_is_rate_limit(e)) from e


def servable_versions(db: Session, user: User, course_id: str) -> list[tuple[DocumentVersion, Document]]:
    """Version Published hiện hành, không khóa, trong môn user được đọc, đúng ACL/nhãn liêm chính."""
    if not acl.can_read_course(db, user, course_id):
        return []
    rows = db.execute(
        select(DocumentVersion, Document)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(
            Document.course_id == course_id,
            Document.emergency_locked.is_(False),
            Document.current_version_id == DocumentVersion.id,
            DocumentVersion.state == PUBLISHED,
        )
    ).all()
    scope = _document_scope.get()
    return [(v, d) for v, d in rows if acl.role_can_see_version(user, v) and (scope is None or d.id == scope)]


def _matrix(db: Session, version_id: str) -> tuple[list[str], np.ndarray, list[set[str]]]:
    with _cache_lock:
        if version_id in _cache:
            _cache.move_to_end(version_id)
            return _cache[version_id]
    rows = db.execute(
        select(Chunk.id, Chunk.embedding, Chunk.text).where(
            Chunk.version_id == version_id, Chunk.embedding.is_not(None)
        )
    ).all()
    ids = [r[0] for r in rows]
    mat = np.vstack([np.frombuffer(r[1], dtype=np.float32) for r in rows]) if rows else np.zeros((0, 1), np.float32)
    words = [set(_WORD.findall(r[2].casefold())) for r in rows]
    with _cache_lock:
        _cache[version_id] = (ids, mat, words)
        while len(_cache) > CACHE_MAX_VERSIONS:
            _cache.popitem(last=False)
    return ids, mat, words


@dataclass
class Hit:
    chunk: Chunk
    version: DocumentVersion
    document: Document
    score: float


def search(db: Session, user: User, course_id: str, query: str, k: int | None = None) -> list[Hit]:
    allowed = servable_versions(db, user, course_id)
    if not allowed:
        return []
    q = embed_query(query)
    data = [(version.id, *_matrix(db, version.id)) for version, _doc in allowed]
    data = [d for d in data if d[1] and d[2].shape[1] == q.shape[0]]
    bonus = _keyword_bonus(query, [w for d in data for w in d[3]])
    scored: list[tuple[float, str, str]] = []
    offset = 0
    for version_id, ids, mat, _words in data:
        sims = mat @ q + bonus[offset : offset + len(ids)]
        offset += len(ids)
        top = np.argsort(-sims)[: (k or get_settings().retrieval_top_k)]
        scored += [(float(sims[i]), ids[i], version_id) for i in top]
    scored.sort(reverse=True)
    by_version = {v.id: (v, d) for v, d in allowed}
    hits = []
    for score, chunk_id, version_id in scored[: (k or get_settings().retrieval_top_k)]:
        chunk = db.get(Chunk, chunk_id)
        if chunk is None:
            continue
        v, d = by_version[version_id]
        hits.append(Hit(chunk=chunk, version=v, document=d, score=score))
    return hits


def _keyword_bonus(query: str, chunk_words: list[set[str]]) -> np.ndarray:
    """D-68 — truy xuất lai tối thiểu: chunk lớn (nhiều trang) làm embedding "loãng" một khái niệm nhỏ (vd slide
    "Cohesion" chỉ là một phần chunk ~2.000 ký tự → cosine 0,51 < ngưỡng). Chunk chứa ĐÚNG thuật ngữ HIẾM của câu
    hỏi (độ hiếm log(N/df) chuẩn hóa ≥ 0,5, tính trên các chunk được phép đọc) được cộng tối đa +0,1. Từ phổ biến
    ("kiểm thử" trong môn kiểm thử) không được cộng; ngưỡng bằng chứng giữ nguyên (Q-17)."""
    n = len(chunk_words)
    out = np.zeros(n, dtype=np.float32)
    if n == 0:
        return out
    norm = np.log(n + 1)
    rare = {}
    for term in set(_WORD.findall(query.casefold())):
        df = sum(term in w for w in chunk_words)
        if df and (weight := float(np.log((n + 1) / df) / norm)) >= 0.5:
            rare[term] = weight
    for i, words in enumerate(chunk_words):
        out[i] = min(0.1, 0.08 * sum(wt for t, wt in rare.items() if t in words))
    return out


def still_servable(db: Session, user: User, version_id: str) -> bool:
    """Kiểm tra lại ngay trước khi trả/mở nguồn (BR-03, FR-02.6, AC-10.4)."""
    version = db.get(DocumentVersion, version_id)
    if version is None:
        return False
    db.refresh(version)
    document = db.get(Document, version.document_id)
    if document is None:
        return False
    db.refresh(document)
    return acl.can_serve_version(db, user, version, document)
