"""Dependency-inversion contracts for future production adapters."""

from __future__ import annotations

from typing import Protocol

from src.knowledge_hub.models import Chunk, ChunkCandidate, DocumentVersion, RetrievalFilter


class EmbeddingProvider(Protocol):
    def embed_query(self, text: str) -> list[float]: ...


class VectorSearchStore(Protocol):
    def search(self, vector: list[float], filters: RetrievalFilter, limit: int) -> list[ChunkCandidate]: ...


class LexicalSearchStore(Protocol):
    def search(self, query: str, filters: RetrievalFilter, limit: int) -> list[ChunkCandidate]: ...


class FusionStrategy(Protocol):
    def fuse(
        self,
        vector_candidates: list[ChunkCandidate],
        lexical_candidates: list[ChunkCandidate],
        limit: int,
    ) -> list[ChunkCandidate]: ...


class Reranker(Protocol):
    def rerank(self, query: str, candidates: list[ChunkCandidate], top_k: int) -> list[ChunkCandidate]: ...


class DocumentCatalog(Protocol):
    def list_versions(self, filters: RetrievalFilter) -> list[DocumentVersion]: ...

    def get_version(self, version_id: str) -> DocumentVersion | None: ...

    def get_chunk(self, chunk_id: str) -> Chunk | None: ...
