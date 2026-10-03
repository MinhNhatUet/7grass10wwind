"""Deterministic local reranker suitable when no cross-encoder is configured."""

from __future__ import annotations

import re
from dataclasses import replace

from src.knowledge_hub.models import ChunkCandidate


class TokenOverlapReranker:
    """Rank by query-token coverage, using fusion order as a deterministic tie-break."""

    def rerank(self, query: str, candidates: list[ChunkCandidate], top_k: int) -> list[ChunkCandidate]:
        query_tokens = set(re.findall(r"\w+", query.casefold(), flags=re.UNICODE))
        reranked: list[ChunkCandidate] = []
        for candidate in candidates:
            text_tokens = set(re.findall(r"\w+", candidate.text.casefold(), flags=re.UNICODE))
            score = len(query_tokens & text_tokens) / max(len(query_tokens), 1)
            reranked.append(replace(candidate, rerank_score=score))
        reranked.sort(
            key=lambda candidate: (
                -(candidate.rerank_score or 0.0),
                -(candidate.fusion_score or 0.0),
                candidate.chunk_id,
            )
        )
        return reranked[:top_k]
