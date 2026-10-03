"""Small BM25 implementation for deterministic fixture tests and demos."""

from __future__ import annotations

import math
import re
from collections import Counter

from src.knowledge_hub.models import Chunk, ChunkCandidate, DocumentVersion, RetrievalFilter
from src.knowledge_hub.policies import is_version_eligible


def _tokens(text: str) -> list[str]:
    return re.findall(r"\w+", text.casefold(), flags=re.UNICODE)


class InMemoryBM25Store:
    def __init__(
        self,
        chunks: list[Chunk],
        versions: list[DocumentVersion],
        k1: float = 1.5,
        b: float = 0.75,
    ) -> None:
        self._chunks = list(chunks)
        self._versions = {version.version_id: version for version in versions}
        self._k1 = k1
        self._b = b
        self.call_count = 0
        self.last_filter: RetrievalFilter | None = None

    def search(self, query: str, filters: RetrievalFilter, limit: int) -> list[ChunkCandidate]:
        self.call_count += 1
        self.last_filter = filters
        eligible = [
            chunk
            for chunk in self._chunks
            if (version := self._versions.get(chunk.version_id)) is not None and is_version_eligible(version, filters)
        ]
        query_tokens = _tokens(query)
        if not eligible or not query_tokens:
            return []

        tokenized = {chunk.chunk_id: _tokens(chunk.text) for chunk in eligible}
        average_length = sum(len(tokens) for tokens in tokenized.values()) / len(tokenized)
        document_frequency = {
            token: sum(token in set(tokens) for tokens in tokenized.values()) for token in set(query_tokens)
        }
        document_count = len(eligible)
        scored: list[ChunkCandidate] = []
        for chunk in eligible:
            tokens = tokenized[chunk.chunk_id]
            counts = Counter(tokens)
            score = 0.0
            for token in query_tokens:
                frequency = counts[token]
                if not frequency:
                    continue
                df = document_frequency[token]
                inverse_frequency = math.log(1.0 + (document_count - df + 0.5) / (df + 0.5))
                length_factor = 1.0 - self._b + self._b * len(tokens) / max(average_length, 1.0)
                score += inverse_frequency * frequency * (self._k1 + 1.0) / (frequency + self._k1 * length_factor)
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
                    lexical_score=score,
                )
            )
        scored.sort(key=lambda candidate: (-(candidate.lexical_score or 0.0), candidate.chunk_id))
        return scored[:limit]
