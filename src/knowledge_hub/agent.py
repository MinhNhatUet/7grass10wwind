"""Knowledge Hub orchestration without framework, database, or LLM dependencies."""

from __future__ import annotations

import re
from dataclasses import replace
from typing import TypeVar

from src.knowledge_hub.config import HubConfig
from src.knowledge_hub.errors import InvalidRequest, RetrievalError
from src.knowledge_hub.interfaces import (
    DocumentCatalog,
    EmbeddingProvider,
    FusionStrategy,
    LexicalSearchStore,
    Reranker,
    VectorSearchStore,
)
from src.knowledge_hub.models import (
    AccessScope,
    ChunkCandidate,
    HubSearchItem,
    HubSearchRequest,
    HubSearchResponse,
    HubTrace,
    RetrievalFilter,
    SourceView,
)
from src.knowledge_hub.policies import (
    build_eligibility_filter,
    can_download,
    version_rejection_reason,
)
from src.knowledge_hub.ranking import group_and_rank
from src.knowledge_hub.snippets import build_locator, build_snippet
from src.knowledge_hub.source_resolver import SourceResolver

T = TypeVar("T")


class KnowledgeHubAgent:
    def __init__(
        self,
        catalog: DocumentCatalog,
        vector_store: VectorSearchStore,
        lexical_store: LexicalSearchStore,
        embedding_provider: EmbeddingProvider,
        fusion_strategy: FusionStrategy,
        reranker: Reranker,
        config: HubConfig | None = None,
    ) -> None:
        self._catalog = catalog
        self._vector_store = vector_store
        self._lexical_store = lexical_store
        self._embedding_provider = embedding_provider
        self._fusion_strategy = fusion_strategy
        self._reranker = reranker
        self._config = config or HubConfig()
        self._source_resolver = SourceResolver(catalog, self._config.snippet_max_chars)

    def search(self, request: HubSearchRequest, access: AccessScope) -> HubSearchResponse:
        self._validate_request(request)
        filters = build_eligibility_filter(request, access)
        query = self._normalize_query(request.query)
        if query is None:
            return self._browse(request, access, filters)
        return self._hybrid(request, access, filters, query)

    def resolve_source(self, version_id: str, chunk_id: str | None, access: AccessScope) -> SourceView:
        if not version_id.strip():
            raise InvalidRequest("version_id is required")
        if chunk_id is not None and not chunk_id.strip():
            raise InvalidRequest("chunk_id cannot be blank")
        return self._source_resolver.resolve(version_id, chunk_id, access)

    def _validate_request(self, request: HubSearchRequest) -> None:
        if not isinstance(request.course_id, str) or not request.course_id.strip():
            raise InvalidRequest("course_id is required")
        if not isinstance(request.page, int) or request.page < 1:
            raise InvalidRequest("page must be at least 1")
        if not isinstance(request.page_size, int) or request.page_size <= 0:
            raise InvalidRequest("page_size must be positive")
        if request.page_size > self._config.max_page_size:
            raise InvalidRequest(f"page_size cannot exceed {self._config.max_page_size}")
        if request.query is not None and not isinstance(request.query, str):
            raise InvalidRequest("query must be text or None")

    @staticmethod
    def _normalize_query(query: str | None) -> str | None:
        if query is None:
            return None
        normalized = re.sub(r"\s+", " ", query).strip()
        return normalized or None

    @staticmethod
    def _page(items: list[T], page: int, page_size: int) -> list[T]:
        start = (page - 1) * page_size
        return items[start : start + page_size]

    def _browse(
        self,
        request: HubSearchRequest,
        access: AccessScope,
        filters: RetrievalFilter,
    ) -> HubSearchResponse:
        versions = self._catalog.list_versions(filters)
        versions.sort(key=lambda version: (version.title.casefold(), version.version_label or "", version.version_id))
        versions = versions[: self._config.max_results]
        items = [
            HubSearchItem(
                document_id=version.document_id,
                version_id=version.version_id,
                chunk_id=None,
                title=version.title,
                course_id=version.course_id,
                document_type=version.document_type,
                version_label=version.version_label,
                snippet=None,
                locator=None,
                score=None,
                best_match_score=None,
                can_view=True,
                can_download=can_download(version, access),
            )
            for version in versions
        ]
        page_items = self._page(items, request.page, request.page_size)
        trace = HubTrace(
            mode="browse",
            requested_course_id=filters.course_id,
            eligible_candidate_count=len(items),
            returned_count=len(page_items),
        )
        return HubSearchResponse(
            items=page_items,
            total=len(items),
            page=request.page,
            page_size=request.page_size,
            mode="browse",
            trace=trace,
        )

    def _hybrid(
        self,
        request: HubSearchRequest,
        access: AccessScope,
        filters: RetrievalFilter,
        query: str,
    ) -> HubSearchResponse:
        trace = HubTrace(mode="hybrid", requested_course_id=filters.course_id)
        try:
            vector = self._embedding_provider.embed_query(query)
            vector_candidates = self._vector_store.search(vector, filters, self._config.vector_top_k)
            lexical_candidates = self._lexical_store.search(query, filters, self._config.lexical_top_k)
            trace.vector_candidate_count = len(vector_candidates)
            trace.lexical_candidate_count = len(lexical_candidates)
            fused = self._fusion_strategy.fuse(
                vector_candidates,
                lexical_candidates,
                self._config.fusion_top_k,
            )
        except Exception as error:
            raise RetrievalError("hybrid retrieval failed") from error

        trace.fused_candidate_count = len(fused)
        validated = self._validate_candidates(fused, filters, trace)
        trace.eligible_candidate_count = len(validated)
        reranked = self._rerank(query, validated, trace)
        trace.reranked_candidate_count = len(reranked)

        ranked_versions = group_and_rank(reranked)[: self._config.max_results]
        items: list[HubSearchItem] = []
        for ranked in ranked_versions:
            version = self._catalog.get_version(ranked.version_id)
            if version is None or version_rejection_reason(version, filters) is not None:
                self._increment_reason(trace, "changed_after_rerank")
                continue
            best = ranked.best_chunk
            items.append(
                HubSearchItem(
                    document_id=version.document_id,
                    version_id=version.version_id,
                    chunk_id=best.chunk_id,
                    title=version.title,
                    course_id=version.course_id,
                    document_type=version.document_type,
                    version_label=version.version_label,
                    snippet=build_snippet(best.text, self._config.snippet_max_chars),
                    locator=build_locator(best),
                    score=ranked.score,
                    best_match_score=best.rerank_score,
                    can_view=True,
                    can_download=can_download(version, access),
                )
            )

        page_items = self._page(items, request.page, request.page_size)
        trace.returned_count = len(page_items)
        return HubSearchResponse(
            items=page_items,
            total=len(items),
            page=request.page,
            page_size=request.page_size,
            mode="hybrid",
            trace=trace,
        )

    def _validate_candidates(
        self,
        candidates: list[ChunkCandidate],
        filters: RetrievalFilter,
        trace: HubTrace,
    ) -> list[ChunkCandidate]:
        validated: list[ChunkCandidate] = []
        seen: set[str] = set()
        for candidate in candidates:
            if candidate.chunk_id in seen:
                self._increment_reason(trace, "duplicate_chunk")
                continue
            seen.add(candidate.chunk_id)
            chunk = self._catalog.get_chunk(candidate.chunk_id)
            if chunk is None:
                self._increment_reason(trace, "chunk_missing")
                continue
            if chunk.version_id != candidate.version_id:
                self._increment_reason(trace, "version_mismatch")
                continue
            version = self._catalog.get_version(chunk.version_id)
            if version is None:
                self._increment_reason(trace, "version_missing")
                continue
            reason = version_rejection_reason(version, filters)
            if reason is not None:
                self._increment_reason(trace, reason)
                continue
            validated.append(
                replace(
                    candidate,
                    version_id=chunk.version_id,
                    text=chunk.text,
                    page=chunk.page,
                    slide=chunk.slide,
                    section=chunk.section,
                )
            )
        return validated

    def _rerank(
        self,
        query: str,
        candidates: list[ChunkCandidate],
        trace: HubTrace,
    ) -> list[ChunkCandidate]:
        if not candidates:
            return []
        try:
            output = self._reranker.rerank(query, candidates, self._config.rerank_top_k)
        except Exception as error:
            if not self._config.allow_reranker_fallback:
                raise RetrievalError("reranker failed") from error
            trace.reranker_fallback = True
            return [
                replace(candidate, rerank_score=candidate.fusion_score or 0.0)
                for candidate in candidates[: self._config.rerank_top_k]
            ]

        canonical = {candidate.chunk_id: candidate for candidate in candidates}
        safe_output: list[ChunkCandidate] = []
        seen: set[str] = set()
        for returned in output:
            original = canonical.get(returned.chunk_id)
            if original is None or returned.chunk_id in seen:
                continue
            seen.add(returned.chunk_id)
            score = returned.rerank_score
            if score is None:
                score = original.fusion_score or 0.0
            safe_output.append(replace(original, rerank_score=float(score)))
            if len(safe_output) == self._config.rerank_top_k:
                break
        return safe_output

    @staticmethod
    def _increment_reason(trace: HubTrace, reason: str) -> None:
        trace.filtered_reason_counts[reason] = trace.filtered_reason_counts.get(reason, 0) + 1
