"""Retrieval đúng quyền (BL-15; BR-01, BR-03, BR-13; PRD 10.1 bước 5; D-21).

Thứ tự: xác định tập version được phép bằng SQL + ACL → CHỈ chấm embedding của các version đó (Postgres: pgvector
trong SQL, D-84; SQLite: cosine bằng numpy) → top-k. Không bao giờ tính similarity trên toàn kho rồi mới lọc.
"""

from __future__ import annotations

import re
import threading
import time
import unicodedata
from collections import Counter, OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

import numpy as np
from sqlalchemy import Float, func, literal, select
from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import PUBLISHED, Chunk, Document, DocumentVersion, Embedding, User
from src.services import acl

# version_id → _Index (chunk_ids, ma trận đã chuẩn hóa — SQLite, thống kê BM25). LRU có trần: version không còn được
# hỏi (đã thu hồi/lưu trữ) tự rơi khỏi cache thay vì giữ mãi.
_cache: OrderedDict[str, _Index] = OrderedDict()
CACHE_MAX_VERSIONS = 256
# Trọng số BM25 khi trộn với cosine (tính theo biên độ cosine của môn). Đo trên 80 câu hỏi sinh từ chunk thật của 8
# môn: cosine + điểm từ khóa cũ hit@1 0.54 / hit@6 0.91 → trộn 0.3: 0.59 / 0.94 (0.5: 0.57 / 0.91; RRF không hơn dense).
LEX_WEIGHT = 0.3
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


# ponytail: cắt theo ký tự, không đếm token. Chunk rất dài (vd 20k ký tự công thức) vượt 8.191 token của
# text-embedding-3-large → cả lô bị từ chối. Phần sau mốc không vào vector (text chunk/trích dẫn vẫn đủ). Cần chính xác
# hơn thì đếm token bằng tokenizer của model hoặc chia chunk ở bước pipeline.
EMBED_MAX_CHARS = 8000


def chunk_embedding_text(chunk: Chunk) -> str:
    """Include section hierarchy in embeddings without polluting the source excerpt."""
    text = chunk.text.strip()
    text = f"Section: {chunk.section.strip()}\n\n{text}" if chunk.section and chunk.section.strip() else text
    return text[:EMBED_MAX_CHARS]


def embed_query(text: str) -> np.ndarray:
    from src.services.llm import get_embeddings

    cached = (_prefetched.get() or {}).get(text)
    if cached is not None:
        return cached
    try:
        return np.frombuffer(to_blob(get_embeddings().embed_query(text)), dtype=np.float32)
    except Exception as e:
        raise EmbeddingUnavailableError(_is_rate_limit(e)) from e


_prefetched: ContextVar[dict[str, np.ndarray] | None] = ContextVar("prefetched_queries", default=None)


@contextmanager
def prefetch_queries(texts: list[str]):
    """Embed trước nhiều truy vấn SONG SONG (mỗi lần gọi ~1 s mạng); search() trong khối dùng lại vector đã có thay vì
    gọi tuần tự. Lỗi lượt nào thì truy vấn đó được embed lại (và báo lỗi) khi search() thật sự cần."""
    texts = list(dict.fromkeys(texts))
    with ThreadPoolExecutor(max_workers=min(8, len(texts) or 1)) as pool:
        futures = {t: pool.submit(embed_query, t) for t in texts}
    vectors = {t: f.result() for t, f in futures.items() if f.exception() is None}
    token = _prefetched.set(vectors)
    try:
        yield
    finally:
        _prefetched.reset(token)


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


def _fold(text: str) -> str:
    """Chữ thường, bỏ dấu tiếng Việt — người dùng hay gõ không dấu ("tich phan mat")."""
    s = unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def lexical_terms(text: str) -> list[str]:
    """Âm tiết + CẶP âm tiết liền nhau (đã bỏ dấu). Tiếng Việt mang nghĩa ở cặp ("tich_phan", "gia_tri"); âm tiết rời
    ngắn (2–3 ký tự) vẫn giữ — trước đây chỉ lấy từ ≥ 4 ký tự nên phần lớn âm tiết tiếng Việt bị bỏ qua."""
    w = re.findall(r"\w+", _fold(text))
    return w + [f"{a}_{b}" for a, b in zip(w, w[1:], strict=False)]


@dataclass
class _Index:
    ids: list[str]
    mat: np.ndarray  # SQLite: vector đã chuẩn hóa; Postgres: rỗng (cosine tính trong SQL)
    tfs: list[Counter[str]]  # tần suất term từng chunk (BM25)
    lens: np.ndarray
    df: Counter[str]


def _matrix(db: Session, version_id: str) -> _Index:
    with _cache_lock:
        if version_id in _cache:
            _cache.move_to_end(version_id)
            return _cache[version_id]
    # Postgres (D-84): cosine tính trong SQL bằng pgvector → cache chỉ giữ thống kê BM25, không nạp vector
    pg = db.get_bind().dialect.name == "postgresql"
    cols = (Chunk.id, Chunk.text) if pg else (Chunk.id, Chunk.text, Chunk.embedding)
    rows = db.execute(select(*cols).where(Chunk.version_id == version_id, Chunk.embedding.is_not(None))).all()
    if pg or not rows:
        mat = np.zeros((0, 1), np.float32)
    else:
        mat = np.vstack([np.frombuffer(r[2], dtype=np.float32) for r in rows])
    tfs = [Counter(lexical_terms(r[1])) for r in rows]
    index = _Index([r[0] for r in rows], mat, tfs, np.array([sum(t.values()) for t in tfs], np.float32),
                   Counter(t for tf in tfs for t in tf))  # fmt: skip
    with _cache_lock:
        _cache[version_id] = index
        while len(_cache) > CACHE_MAX_VERSIONS:
            _cache.popitem(last=False)
    return index


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
    k = k or get_settings().retrieval_top_k
    data = [(version.id, _matrix(db, version.id)) for version, _doc in allowed]
    ids = [cid for _v, ix in data for cid in ix.ids]
    if not ids:
        return []
    owner = [vid for vid, ix in data for _ in ix.ids]
    cos = _cosine(db, data, q)
    score = cos + _lexical_boost(query, [ix for _v, ix in data], cos)
    by_version = {v.id: (v, d) for v, d in allowed}
    hits = []
    for i in np.argsort(-score):
        if len(hits) == k or np.isnan(score[i]):  # nan (khác số chiều embedding) xếp cuối
            break
        chunk = db.get(Chunk, ids[i])
        if chunk is None:
            continue
        v, d = by_version[owner[i]]
        hits.append(Hit(chunk=chunk, version=v, document=d, score=float(score[i])))
    return hits


def _cosine(db: Session, data: list[tuple[str, _Index]], q: np.ndarray) -> np.ndarray:
    """Cosine từng chunk (thứ tự như `data`), CHỈ trên các version đã qua ACL; chunk embed bằng model khác số chiều → nan.
    Postgres (D-84): pgvector trong SQL, quét exact theo các version của môn (không index ANN).
    ponytail: quét exact cả môn (cần cosine mọi chunk để trộn BM25); lên ~10^5 chunk mỗi môn thì thêm HNSW, lấy top-N
    cosine ∪ top-N BM25 làm ứng viên."""
    if db.get_bind().dialect.name != "postgresql":
        return np.concatenate([
            ix.mat @ q if ix.mat.shape[1] == q.shape[0] else np.full(len(ix.ids), np.nan, np.float32) for _v, ix in data
        ])  # fmt: skip
    dist = Chunk.embedding.op("<=>", return_type=Float)(literal(q.tobytes(), Embedding()))
    same_dim = func.vector_dims(Chunk.embedding) == q.shape[0]
    rows = db.execute(
        select(Chunk.id, dist).where(Chunk.version_id.in_([v for v, _ in data]), Chunk.embedding.is_not(None), same_dim)
    ).all()
    sims = {cid: 1.0 - float(d) for cid, d in rows}
    return np.array([sims.get(cid, np.nan) for _v, ix in data for cid in ix.ids], np.float32)


def _lexical_boost(query: str, indexes: list[_Index], cos: np.ndarray) -> np.ndarray:
    """D-68 → BM25 (âm tiết + cặp âm tiết, bỏ dấu) trên các chunk được phép đọc, chuẩn hóa về [0, 1] rồi nhân
    LEX_WEIGHT × biên độ cosine của môn: chunk lớn (nhiều trang) làm embedding "loãng" một khái niệm nhỏ, câu hỏi ngắn /
    không dấu / sai chính tả nhẹ làm embedding lệch — chunk chứa ĐÚNG thuật ngữ của câu hỏi được kéo lên. Term phổ biến
    có idf thấp nên gần như không cộng; ngưỡng bằng chứng giữ nguyên (Q-17)."""
    tfs = [tf for ix in indexes for tf in ix.tfs]
    lens = np.concatenate([ix.lens for ix in indexes])
    n, avg = len(tfs), float(lens.mean()) or 1.0
    out = np.zeros(n, np.float32)
    k1, b = 1.2, 0.75
    for term in set(lexical_terms(query)):
        df = sum(ix.df.get(term, 0) for ix in indexes)
        if not df:
            continue
        idf = np.log(1 + (n - df + 0.5) / (df + 0.5))
        tf = np.array([d.get(term, 0) for d in tfs], np.float32)
        out += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * lens / avg))
    valid = cos[~np.isnan(cos)]
    if not out.max() or len(valid) < 2:
        return out * 0
    return LEX_WEIGHT * (out / out.max()) * float(valid.max() - valid.min())


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
