"""Cosine vector search over fixture data with pre-retrieval filtering."""

from __future__ import annotations

import math

from src.knowledge_hub.models import Chunk, ChunkCandidate, DocumentVersion, RetrievalFilter
from src.knowledge_hub.policies import is_version_eligible


def _cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return sum(a * b for a, b in zip(left, right, strict=True)) / (left_norm * right_norm)


class InMemoryVectorStore:
    def __init__(
        self,
        chunks: list[Chunk],
        versions: list[DocumentVersion],
        embeddings: dict[str, list[float]],
    ) -> None:
        self._chunks = {chunk.chunk_id: chunk for chunk in chunks}
        self._versions = {version.version_id: version for version in versions}
        self._embeddings = embeddings
        self.call_count = 0
        self.last_filter: RetrievalFilter | None = None

    def search(self, vector: list[float], filters: RetrievalFilter, limit: int) -> list[ChunkCandidate]:
        self.call_count += 1
        self.last_filter = filters
        scored: list[ChunkCandidate] = []
        for chunk in self._chunks.values():
            version = self._versions.get(chunk.version_id)
            embedding = self._embeddings.get(chunk.chunk_id)
            if version is None or embedding is None or not is_version_eligible(version, filters):
                continue
            score = _cosine(vector, embedding)
            if score <= 0:
                continue
            scored.append(
                ChunkCandidate(
                    chunk_id=chunk.chunk_id,
                    version_id=chunk.version_id,
                    text=chunk.text,
                    page=chunk.page,
                    slide=chunk.slide,
                    section=chunk.section,
                    vector_score=score,
                )
            )
        scored.sort(key=lambda candidate: (-(candidate.vector_score or 0.0), candidate.chunk_id))
        return scored[:limit]
