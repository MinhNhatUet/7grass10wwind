"""Controllable deterministic reranker for unit tests."""

from __future__ import annotations

import re
from dataclasses import replace

from src.knowledge_hub.models import ChunkCandidate


class FakeReranker:
    def __init__(self, scores: dict[str, float] | None = None, fail: bool = False) -> None:
        self.scores = scores or {}
        self.fail = fail
        self.call_count = 0
        self.last_candidates: list[ChunkCandidate] = []

    def rerank(self, query: str, candidates: list[ChunkCandidate], top_k: int) -> list[ChunkCandidate]:
        self.call_count += 1
        self.last_candidates = list(candidates)
        if self.fail:
            raise RuntimeError("configured fake reranker failure")
        query_tokens = set(re.findall(r"\w+", query.casefold(), flags=re.UNICODE))
        reranked: list[ChunkCandidate] = []
        for candidate in candidates:
            text_tokens = set(re.findall(r"\w+", candidate.text.casefold(), flags=re.UNICODE))
            overlap = len(query_tokens & text_tokens) / max(len(query_tokens), 1)
            score = self.scores.get(candidate.chunk_id, overlap)
            reranked.append(replace(candidate, rerank_score=float(score)))
        reranked.sort(key=lambda candidate: (-(candidate.rerank_score or 0.0), candidate.chunk_id))
        return reranked[:top_k]
