"""SQLAlchemy adapters that connect Knowledge Hub Core to the real application database.

This module is an integration boundary: SQLAlchemy, ORM and resolved application ACL
stay here while ``src.knowledge_hub`` remains independent from Backend infrastructure.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from dataclasses import asdict
from typing import Any

import numpy as np
from sqlalchemy import Select, false, func, select
from sqlalchemy.orm import Session

from src.db import get_sessionmaker
from src.knowledge_hub.adapters import InMemoryBM25Store, TokenOverlapReranker
from src.knowledge_hub.agent import KnowledgeHubAgent
from src.knowledge_hub.config import HubConfig
from src.knowledge_hub.errors import InvalidRequest
from src.knowledge_hub.interfaces import EmbeddingProvider, Reranker
from src.knowledge_hub.models import (
    AccessScope,
    ChunkCandidate,
    HubSearchRequest,
    HubSearchResponse,
    RetrievalFilter,
    SearchFilters,
)
from src.knowledge_hub.models import (
    Chunk as HubChunk,
)
from src.knowledge_hub.models import (
    DocumentVersion as HubDocumentVersion,
)
from src.knowledge_hub.policies import is_version_eligible
from src.knowledge_hub.retrieval import ReciprocalRankFusion
from src.models.orm import PUBLISHED, WITHDRAWN, Chunk, Document, DocumentVersion, User
from src.services import acl
from src.services.formatting import iso
from src.services.llm import get_embeddings

SessionFactory = Callable[[], Session]


def _version_statement(filters: RetrievalFilter) -> Select:
    conditions = [
        Document.course_id == filters.course_id,
        Document.emergency_locked.is_(False),
        Document.current_version_id == DocumentVersion.id,
        DocumentVersion.state == filters.required_status,
    ]
    if filters.allowed_version_ids is not None:
        if not filters.allowed_version_ids:
            conditions.append(false())
        else:
            conditions.append(DocumentVersion.id.in_(filters.allowed_version_ids))
    if filters.document_type is not None:
        conditions.append(func.lower(Document.doc_type) == filters.document_type.casefold())
    if filters.chapter is not None:
        conditions.append(func.lower(DocumentVersion.chapter) == filters.chapter.casefold())
    if filters.version is not None:
        conditions.append(func.lower(DocumentVersion.version_label) == filters.version.casefold())

    # The current ORM has no topic/semester columns. A requested value must not be
    # silently ignored, otherwise results would violate the caller's filter.
    if filters.topic is not None or filters.semester is not None:
        conditions.append(false())

    return (
        select(DocumentVersion, Document).join(Document, Document.id == DocumentVersion.document_id).where(*conditions)
    )


def _chunk_statement(filters: RetrievalFilter) -> Select:
    version_ids = _version_statement(filters).with_only_columns(DocumentVersion.id)
    return select(Chunk).where(Chunk.version_id.in_(version_ids)).order_by(Chunk.version_id, Chunk.ordinal)


def _map_version(version: DocumentVersion, document: Document) -> HubDocumentVersion:
    available = (
        version.state == PUBLISHED and not document.emergency_locked and document.current_version_id == version.id
    )
    return HubDocumentVersion(
        document_id=document.id,
        version_id=version.id,
        course_id=document.course_id,
        title=document.title,
        document_type=document.doc_type,
        version_label=version.version_label,
        status=version.state,
        withdrawn=version.state == WITHDRAWN,
        chapter=version.chapter,
        can_download_default=version.download_allowed,
        available=available,
    )


def _map_chunk(chunk: Chunk) -> HubChunk:
    return HubChunk(
        chunk_id=chunk.id,
        version_id=chunk.version_id,
        text=chunk.text,
        page=chunk.locator_value if chunk.locator_type == "page" else None,
        slide=chunk.locator_value if chunk.locator_type == "slide" else None,
        section=chunk.section,
    )


class SQLAlchemyDocumentCatalog:
    """Catalog backed by the current application Session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self.last_filter: RetrievalFilter | None = None

    def list_versions(self, filters: RetrievalFilter) -> list[HubDocumentVersion]:
        self.last_filter = filters
        mapped = [
            _map_version(version, document) for version, document in self._session.execute(_version_statement(filters))
        ]
        return [version for version in mapped if is_version_eligible(version, filters)]

    def get_version(self, version_id: str) -> HubDocumentVersion | None:
        row = self._session.execute(
            select(DocumentVersion, Document)
            .join(Document, Document.id == DocumentVersion.document_id)
            .where(DocumentVersion.id == version_id)
        ).one_or_none()
        return _map_version(*row) if row is not None else None

    def get_chunk(self, chunk_id: str) -> HubChunk | None:
        chunk = self._session.get(Chunk, chunk_id)
        return _map_chunk(chunk) if chunk is not None else None


class SQLAlchemyVectorStore:
    """Cosine search over embedding blobs after SQL eligibility filtering."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self.last_filter: RetrievalFilter | None = None

    def search(self, vector: list[float], filters: RetrievalFilter, limit: int) -> list[ChunkCandidate]:
        self.last_filter = filters
        query = np.asarray(vector, dtype=np.float32)
        query_norm = float(np.linalg.norm(query))
        if not query_norm:
            return []

        chunks = [c for c in self._session.scalars(_chunk_statement(filters)) if c.embedding is not None]
        if not chunks:
            return []
        # Cosine vector hóa bằng NumPy (như retrieval.py); blob là float32 little-endian
        stored = [np.frombuffer(c.embedding, dtype="<f4") for c in chunks]
        if any(len(s) != len(query) for s in stored):
            dim = next(len(s) for s in stored if len(s) != len(query))
            raise ValueError(f"query embedding dimension {len(query)} does not match database dimension {dim}")
        mat = np.vstack(stored)
        norms = np.linalg.norm(mat, axis=1)
        scores = (mat @ query) / np.where(norms == 0, 1.0, norms * query_norm)

        candidates: list[ChunkCandidate] = []
        for chunk, norm, score in zip(chunks, norms, scores, strict=True):
            if not norm:
                continue
            mapped = _map_chunk(chunk)
            candidates.append(
                ChunkCandidate(
                    chunk_id=mapped.chunk_id,
                    version_id=mapped.version_id,
                    text=mapped.text,
                    page=mapped.page,
                    slide=mapped.slide,
                    vector_score=float(score),
                )
            )
        candidates.sort(key=lambda candidate: (-(candidate.vector_score or 0.0), candidate.chunk_id))
        return candidates[:limit]


class SQLAlchemyBM25Store:
    """BM25 over only the chunks selected by the SQL eligibility query."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self.last_filter: RetrievalFilter | None = None

    def search(self, query: str, filters: RetrievalFilter, limit: int) -> list[ChunkCandidate]:
        self.last_filter = filters
        version_rows = list(self._session.execute(_version_statement(filters)))
        versions = [_map_version(version, document) for version, document in version_rows]
        chunks = [_map_chunk(chunk) for chunk in self._session.scalars(_chunk_statement(filters))]
        return InMemoryBM25Store(chunks, versions).search(query, filters, limit)


class ConfiguredQueryEmbeddingProvider:
    """Query embedder using the provider already configured by the application."""

    def embed_query(self, text: str) -> list[float]:
        return list(get_embeddings().embed_query(text))


def resolve_database_access_scope(session: Session, user: User, document_id: str | None = None) -> AccessScope:
    """Resolve application user/membership/ACL into the core's concrete scope."""
    course_ids = frozenset(acl.readable_course_ids(session, user))
    if not course_ids:
        return AccessScope(user_id=user.id, allowed_course_ids=frozenset(), allowed_version_ids=frozenset())

    statement = (
        select(DocumentVersion, Document)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(
            Document.course_id.in_(course_ids),
            Document.emergency_locked.is_(False),
            Document.current_version_id == DocumentVersion.id,
            DocumentVersion.state == PUBLISHED,
        )
    )
    if document_id is not None:
        statement = statement.where(Document.id == document_id)
    rows = session.execute(statement)
    allowed: set[str] = set()
    downloadable: set[str] = set()
    for version, document in rows:
        if not acl.can_serve_version(session, user, version, document):
            continue
        allowed.add(version.id)
        if acl.can_download_version(session, user, version, document):
            downloadable.add(version.id)
    return AccessScope(
        user_id=user.id,
        allowed_course_ids=course_ids,
        allowed_version_ids=allowed,
        downloadable_version_ids=downloadable,
    )


def build_database_hub(
    session: Session,
    user: User,
    *,
    config: HubConfig | None = None,
    embedding_provider: EmbeddingProvider | None = None,
    reranker: Reranker | None = None,
) -> tuple[KnowledgeHubAgent, AccessScope]:
    # Conversation-scoped searches must not escape to another document in the
    # same course.  Import lazily to keep the core/database boundary acyclic.
    from src.services.retrieval import current_document_scope

    hub_config = config or HubConfig()
    hub = KnowledgeHubAgent(
        catalog=SQLAlchemyDocumentCatalog(session),
        vector_store=SQLAlchemyVectorStore(session),
        lexical_store=SQLAlchemyBM25Store(session),
        embedding_provider=embedding_provider or ConfiguredQueryEmbeddingProvider(),
        fusion_strategy=ReciprocalRankFusion(hub_config.rrf_k),
        reranker=reranker or TokenOverlapReranker(),
        config=hub_config,
    )
    return hub, resolve_database_access_scope(session, user, current_document_scope())


def search_database_session(
    session: Session,
    user: User,
    request: HubSearchRequest,
    *,
    config: HubConfig | None = None,
    embedding_provider: EmbeddingProvider | None = None,
    reranker: Reranker | None = None,
) -> HubSearchResponse:
    """Run Knowledge Hub Core inside an existing authenticated DB request."""
    hub, access = build_database_hub(
        session,
        user,
        config=config,
        embedding_provider=embedding_provider,
        reranker=reranker,
    )
    return hub.search(request, access)


def _chunk_locator(chunk: Chunk) -> dict[str, Any]:
    """Return the authoritative locator, including a multi-page span and section."""
    positions = [chunk.locator_value]
    if chunk.locator_type == "page":
        positions.extend(int(page) for _, page in chunk.page_map or [])
    first, last = min(positions), max(positions)
    return {
        "type": chunk.locator_type,
        "value": first,
        "end": last if last != first else None,
        "section": chunk.section,
    }


def _exact_quote(chunk: Chunk, limit: int = 300) -> str:
    """Literal source excerpt; unlike a display snippet it is never whitespace-rewritten."""
    text = chunk.text.strip()
    return text if len(text) <= limit else text[:limit].rstrip()


def _quote_locator(chunk: Chunk, quote: str) -> dict[str, Any]:
    if chunk.locator_type != "page" or not chunk.page_map:
        return {
            "type": chunk.locator_type,
            "value": chunk.locator_value,
            "end": None,
            "section": chunk.section,
        }
    start = chunk.text.find(quote)
    start = max(start, 0)
    first = chunk.page_at(start)
    last = chunk.page_at(start + max(len(quote) - 1, 0))
    return {
        "type": chunk.locator_type,
        "value": first,
        "end": last if last != first else None,
        "section": chunk.section,
    }


def hub_response_view(session: Session, response: HubSearchResponse, *, include_trace: bool = False) -> dict[str, Any]:
    """Map core results to the stable Backend payload with exact source references."""
    items: list[dict[str, Any]] = []
    for item in response.items:
        version = session.get(DocumentVersion, item.version_id)
        document = session.get(Document, item.document_id)
        chunk = session.get(Chunk, item.chunk_id) if item.chunk_id else None
        if version is None or document is None:
            continue
        locator = _chunk_locator(chunk) if chunk is not None else None
        citation = None
        if chunk is not None:
            quote = _exact_quote(chunk)
            citation = {
                "document_id": document.id,
                "document_title": document.title,
                "version_id": version.id,
                "version_label": version.version_label,
                "chunk_id": chunk.id,
                "locator": _quote_locator(chunk, quote),
                "quote": quote,
            }
        items.append(
            {
                "document_id": document.id,
                "version_id": version.id,
                "chunk_id": chunk.id if chunk is not None else None,
                "course_id": document.course_id,
                "title": document.title,
                "doc_type": document.doc_type,
                "version_label": version.version_label,
                "chapter": version.chapter,
                "file_type": version.file_type,
                "page_count": version.page_count,
                "published_at": iso(version.published_at),
                "snippet": item.snippet,
                "locator": locator,
                "score": item.score,
                "best_match_score": item.best_match_score,
                "can_view": item.can_view,
                "can_download": item.can_download,
                "citation": citation,
            }
        )
    result: dict[str, Any] = {
        "items": items,
        "total": response.total,
        "page": response.page,
        "page_size": response.page_size,
        "mode": response.mode,
    }
    if include_trace and response.trace is not None:
        result["trace"] = asdict(response.trace)
    return result


def search_database(
    query: str,
    *,
    course_id: str = "SE101",
    user_id: str = "u_student",
    filters: SearchFilters | None = None,
    page: int = 1,
    page_size: int = 10,
    session_factory: SessionFactory | None = None,
    embedding_provider: EmbeddingProvider | None = None,
    reranker: Reranker | None = None,
) -> HubSearchResponse:
    """Search real database rows using an existing database user and resolved ACL."""
    factory = session_factory or get_sessionmaker()
    with factory() as session:
        user = session.get(User, user_id)
        if user is None:
            raise InvalidRequest("database user was not found")
        return search_database_session(
            session,
            user,
            HubSearchRequest(
                query=query,
                course_id=course_id,
                filters=filters or SearchFilters(),
                page=page,
                page_size=page_size,
            ),
            embedding_provider=embedding_provider,
            reranker=reranker,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Search Knowledge Hub using the configured application database")
    parser.add_argument("query", help="Query text; pass an empty string for browse mode")
    parser.add_argument("--course", default="SE101", dest="course_id")
    parser.add_argument("--user", default="u_student", dest="user_id")
    parser.add_argument("--document-type")
    parser.add_argument("--chapter")
    parser.add_argument("--version")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--page-size", type=int, default=10)
    arguments = parser.parse_args()
    response = search_database(
        arguments.query,
        course_id=arguments.course_id,
        user_id=arguments.user_id,
        filters=SearchFilters(
            document_type=arguments.document_type,
            chapter=arguments.chapter,
            version=arguments.version,
        ),
        page=arguments.page,
        page_size=arguments.page_size,
    )
    print(json.dumps(asdict(response), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
