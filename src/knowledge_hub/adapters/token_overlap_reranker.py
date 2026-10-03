"""Deterministic local reranker suitable when no cross-encoder is configured."""

from __future__ import annotations

import re
from dataclasses import replace

from src.knowledge_hub.models import ChunkCandidate

# Phủ từ chỉ để phá hòa: câu hỏi tiếng Việt tách thành âm tiết phổ biến ("yêu", "cầu", "và"…) nên chunk dài nào cũng
# phủ ~100% — xếp theo phủ từ trước làm Hub đúng tài liệu đầu 9/14 trên SE101, xếp theo fusion đúng 14/14 (D-76).
COVERAGE_TIE_BREAK = 1e-6  # nhỏ hơn chênh lệch RRF giữa 2 hạng liền kề (~3e-4)


class TokenOverlapReranker:
    """Rank by fusion score (vector + BM25); query-token coverage only breaks near-ties.

    ponytail: không phải reranker ngữ nghĩa thật — thay bằng cross-encoder khi có (PRD v2 AI-4).
    """

    def rerank(self, query: str, candidates: list[ChunkCandidate], top_k: int) -> list[ChunkCandidate]:
        query_tokens = set(re.findall(r"\w+", query.casefold(), flags=re.UNICODE))
        reranked: list[ChunkCandidate] = []
        for candidate in candidates:
            text_tokens = set(re.findall(r"\w+", candidate.text.casefold(), flags=re.UNICODE))
            coverage = len(query_tokens & text_tokens) / max(len(query_tokens), 1)
            score = (candidate.fusion_score or 0.0) + COVERAGE_TIE_BREAK * coverage
            reranked.append(replace(candidate, rerank_score=score))
        reranked.sort(key=lambda candidate: (-(candidate.rerank_score or 0.0), candidate.chunk_id))
        return reranked[:top_k]
