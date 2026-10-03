"""Rank-based fusion that never combines incomparable raw score scales."""

from __future__ import annotations

from dataclasses import replace

from src.knowledge_hub.models import ChunkCandidate


class ReciprocalRankFusion:
    def __init__(self, k: int = 60) -> None:
        if k <= 0:
            raise ValueError("RRF k must be positive")
        self.k = k

    def fuse(
        self,
        vector_candidates: list[ChunkCandidate],
        lexical_candidates: list[ChunkCandidate],
        limit: int,
    ) -> list[ChunkCandidate]:
        if limit <= 0:
            return []

        merged: dict[str, ChunkCandidate] = {}
        contributions: dict[str, float] = {}
        for source, candidates in (("vector", vector_candidates), ("lexical", lexical_candidates)):
            seen_in_branch: set[str] = set()
            for rank, candidate in enumerate(candidates, start=1):
                if candidate.chunk_id in seen_in_branch:
                    continue
                seen_in_branch.add(candidate.chunk_id)
                current = merged.get(candidate.chunk_id, candidate)
                if source == "vector":
                    current = replace(
                        current,
                        vector_score=candidate.vector_score,
                        vector_rank=rank,
                    )
                else:
                    current = replace(
                        current,
                        lexical_score=candidate.lexical_score,
                        lexical_rank=rank,
                    )
                merged[candidate.chunk_id] = current
                contributions[candidate.chunk_id] = contributions.get(candidate.chunk_id, 0.0) + 1.0 / (self.k + rank)

        fused = [replace(candidate, fusion_score=contributions[chunk_id]) for chunk_id, candidate in merged.items()]
        fused.sort(key=lambda candidate: (-(candidate.fusion_score or 0.0), candidate.chunk_id))
        return fused[:limit]
