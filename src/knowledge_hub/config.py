"""Technical tuning values for the standalone retrieval pipeline."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HubConfig:
    vector_top_k: int = 30
    lexical_top_k: int = 30
    fusion_top_k: int = 40
    rerank_top_k: int = 15
    max_results: int = 50
    default_page_size: int = 10
    max_page_size: int = 50
    rrf_k: int = 60
    snippet_max_chars: int = 300
    allow_reranker_fallback: bool = True

    def __post_init__(self) -> None:
        positive = (
            self.vector_top_k,
            self.lexical_top_k,
            self.fusion_top_k,
            self.rerank_top_k,
            self.max_results,
            self.default_page_size,
            self.max_page_size,
            self.rrf_k,
            self.snippet_max_chars,
        )
        if any(value <= 0 for value in positive):
            raise ValueError("HubConfig numeric limits must be positive")
        if self.default_page_size > self.max_page_size:
            raise ValueError("default_page_size cannot exceed max_page_size")
