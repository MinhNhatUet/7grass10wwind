"""Document/version grouping and explainable score aggregation."""

from __future__ import annotations

from dataclasses import dataclass

from src.knowledge_hub.models import ChunkCandidate


@dataclass(frozen=True)
class RankedVersion:
    version_id: str
    best_chunk: ChunkCandidate
    score: float


def group_and_rank(candidates: list[ChunkCandidate]) -> list[RankedVersion]:
    grouped: dict[str, list[ChunkCandidate]] = {}
    for candidate in candidates:
        grouped.setdefault(candidate.version_id, []).append(candidate)

    ranked: list[RankedVersion] = []
    for version_id, matches in grouped.items():
        best = max(
            matches,
            key=lambda candidate: (
                candidate.rerank_score if candidate.rerank_score is not None else float("-inf"),
                candidate.fusion_score if candidate.fusion_score is not None else float("-inf"),
                candidate.chunk_id,
            ),
        )
        score = best.rerank_score if best.rerank_score is not None else (best.fusion_score or 0.0)
        ranked.append(RankedVersion(version_id=version_id, best_chunk=best, score=score))

    ranked.sort(key=lambda item: (-item.score, item.version_id))
    return ranked
