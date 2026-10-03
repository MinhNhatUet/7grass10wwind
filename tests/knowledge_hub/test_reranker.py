from __future__ import annotations

from dataclasses import replace

import pytest

from src.knowledge_hub import HubConfig, HubSearchRequest, KnowledgeHubAgent, RetrievalError
from src.knowledge_hub.demo_data import build_demo_hub, demo_access_scope
from src.knowledge_hub.models import ChunkCandidate
from src.knowledge_hub.retrieval import ReciprocalRankFusion


def test_rerank_top_k_is_applied():
    hub, dependencies = build_demo_hub(config=HubConfig(rerank_top_k=2))
    response = hub.search(HubSearchRequest(query="cây AVL tìm kiếm", course_id="ctdl"), demo_access_scope())
    assert response.trace is not None
    assert response.trace.reranked_candidate_count <= 2
    assert len(dependencies["reranker"].last_candidates) >= response.trace.reranked_candidate_count


def test_reranker_failure_falls_back_to_fusion_and_is_traced():
    hub, _ = build_demo_hub(reranker_fail=True)
    response = hub.search(HubSearchRequest(query="cây AVL", course_id="ctdl"), demo_access_scope())
    assert response.items
    assert response.trace is not None and response.trace.reranker_fallback is True
    assert all(item.best_match_score is not None for item in response.items)


def test_reranker_failure_can_be_configured_as_domain_error():
    hub, _ = build_demo_hub(reranker_fail=True, config=HubConfig(allow_reranker_fallback=False))
    with pytest.raises(RetrievalError):
        hub.search(HubSearchRequest(query="cây AVL", course_id="ctdl"), demo_access_scope())


class MetadataMutatingReranker:
    def rerank(self, query: str, candidates: list[ChunkCandidate], top_k: int) -> list[ChunkCandidate]:
        return [
            replace(
                candidate,
                version_id="evil-version",
                text="fabricated text",
                slide=999,
                rerank_score=0.88,
            )
            for candidate in candidates[:top_k]
        ]


def test_agent_accepts_only_scores_and_preserves_canonical_source_metadata():
    original, dependencies = build_demo_hub()
    config = HubConfig()
    hub = KnowledgeHubAgent(
        catalog=dependencies["catalog"],
        vector_store=dependencies["vector_store"],
        lexical_store=dependencies["lexical_store"],
        embedding_provider=dependencies["embedding"],
        fusion_strategy=ReciprocalRankFusion(config.rrf_k),
        reranker=MetadataMutatingReranker(),
        config=config,
    )
    del original

    response = hub.search(HubSearchRequest(query="cây AVL", course_id="ctdl"), demo_access_scope())
    assert response.items
    assert all(item.version_id != "evil-version" for item in response.items)
    assert all(item.locator is None or item.locator.slide != 999 for item in response.items)
    assert all(item.snippet != "fabricated text" for item in response.items)
