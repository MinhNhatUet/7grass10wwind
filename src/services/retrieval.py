"""Retrieval đúng quyền (BL-15; BR-01, BR-03, BR-13; PRD 10.1 bước 5; D-21).

Thứ tự: xác định tập version được phép bằng SQL + ACL → CHỈ nạp embedding của các version đó →
cosine bằng numpy → top-k. Không bao giờ tính similarity trên toàn kho rồi mới lọc.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import PUBLISHED, Chunk, Document, DocumentVersion, User
from src.services import acl

_cache: dict[str, tuple[list[str], np.ndarray]] = {}  # version_id → (chunk_ids, ma trận đã chuẩn hóa)
_cache_lock = threading.Lock()

# D-33: khi hội thoại gắn một tài liệu, mọi truy xuất trong lượt đó (Academic/Learning/Hub) chỉ lấy từ tài liệu này
_document_scope: ContextVar[str | None] = ContextVar("document_scope", default=None)


@contextmanager
def document_scope(document_id: str | None) -> Iterator[None]:
    token = _document_scope.set(document_id)
    try:
        yield
    finally:
        _document_scope.reset(token)


def to_blob(vec: list[float]) -> bytes:
    arr = np.asarray(vec, dtype=np.float32)
    norm = np.linalg.norm(arr)
    return (arr / norm if norm else arr).tobytes()


def _is_rate_limit(e: Exception) -> bool:
    return type(e).__name__ == "RateLimitError" or getattr(e, "status_code", None) == 429


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


class EmbeddingUnavailableError(Exception):
    """Provider embedding lỗi/hết quota khi truy xuất — trả lỗi kỹ thuật retryable, không phải 500 (PRD 11.4)."""

    def __init__(self, code: str, rate_limited: bool) -> None:
        super().__init__(code)
        self.rate_limited = rate_limited


def embed_query(text: str) -> np.ndarray:
    from src.services.llm import get_embeddings

    try:
        vec = get_embeddings().embed_query(text)
    except Exception as e:  # noqa: BLE001 — timeout/401/429/5xx của provider
        raise EmbeddingUnavailableError(type(e).__name__, _is_rate_limit(e)) from e
    return np.frombuffer(to_blob(vec), dtype=np.float32)


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


def _matrix(db: Session, version_id: str) -> tuple[list[str], np.ndarray]:
    with _cache_lock:
        if version_id in _cache:
            return _cache[version_id]
    rows = db.execute(
        select(Chunk.id, Chunk.embedding).where(Chunk.version_id == version_id, Chunk.embedding.is_not(None))
    ).all()
    ids = [r[0] for r in rows]
    mat = np.vstack([np.frombuffer(r[1], dtype=np.float32) for r in rows]) if rows else np.zeros((0, 1), np.float32)
    with _cache_lock:
        _cache[version_id] = (ids, mat)
    return ids, mat


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
    scored: list[tuple[float, str, str]] = []
    for version, _doc in allowed:
        ids, mat = _matrix(db, version.id)
        if not ids or mat.shape[1] != q.shape[0]:
            continue
        sims = mat @ q
        top = np.argsort(-sims)[: (k or get_settings().retrieval_top_k)]
        scored += [(float(sims[i]), ids[i], version.id) for i in top]
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
