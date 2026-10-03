from __future__ import annotations

from src.knowledge_hub import HubSearchRequest
from src.knowledge_hub.models import ChunkCandidate
from src.knowledge_hub.retrieval import ReciprocalRankFusion


def test_hybrid_calls_embedding_once_and_passes_same_eligibility_filter(hub_bundle):
    hub, dependencies, access = hub_bundle
    response = hub.search(HubSearchRequest(query="cây AVL", course_id="ctdl"), access)

    assert response.mode == "hybrid"
    assert dependencies["embedding"].call_count == 1
    vector_filter = dependencies["vector_store"].last_filter
    lexical_filter = dependencies["lexical_store"].last_filter
    assert vector_filter == lexical_filter
    assert vector_filter.course_id == "ctdl"
    assert vector_filter.required_status == "Published"
    assert vector_filter.exclude_withdrawn is True


def test_rrf_merges_both_branches_deduplicates_and_ignores_raw_score_scale():
    shared_vector = ChunkCandidate("shared", "v1", "same", vector_score=9999.0)
    vector_only = ChunkCandidate("vector", "v1", "vector", vector_score=5000.0)
    shared_lexical = ChunkCandidate("shared", "v1", "same", lexical_score=0.00001)
    lexical_only = ChunkCandidate("lexical", "v1", "lexical", lexical_score=0.00002)

    fused = ReciprocalRankFusion(k=60).fuse(
        [shared_vector, vector_only, shared_vector],
        [shared_lexical, lexical_only],
        limit=10,
    )

    assert [candidate.chunk_id for candidate in fused] == ["shared", "lexical", "vector"]
    assert len({candidate.chunk_id for candidate in fused}) == 3
    assert fused[0].vector_score == 9999.0
    assert fused[0].lexical_score == 0.00001
    assert fused[0].fusion_score < 1.0
    assert fused[0].fusion_score != 9999.00001


def test_stale_withdrawn_index_candidate_is_removed_before_reranker(hub_bundle):
    hub, dependencies, access = hub_bundle
    response = hub.search(HubSearchRequest(query="height imbalance AVL bản cũ", course_id="ctdl"), access)

    reranker_ids = {candidate.version_id for candidate in dependencies["reranker"].last_candidates}
    assert "avl-v1" not in reranker_ids
    assert "avl-v1" not in {item.version_id for item in response.items}
    assert response.trace is not None
    assert response.trace.filtered_reason_counts.get("withdrawn", 0) >= 1


def test_cross_course_and_out_of_version_scope_never_appear(hub_bundle):
    hub, _, access = hub_bundle
    response = hub.search(HubSearchRequest(query="đồ thị database SQL cây", course_id="ctdl"), access)
    returned = {item.version_id for item in response.items}
    assert "db-v1" not in returned
    assert "private-v1" not in returned
    assert all(item.course_id == "ctdl" for item in response.items)


def test_hybrid_grouping_returns_one_card_per_version_and_best_reranked_chunk(hub_bundle):
    hub, _, access = hub_bundle
    response = hub.search(HubSearchRequest(query="cây AVL phép quay", course_id="ctdl"), access)

    version_ids = [item.version_id for item in response.items]
    assert len(version_ids) == len(set(version_ids))
    avl = next(item for item in response.items if item.version_id == "avl-v2")
    assert avl.chunk_id == "c-avl-rotations"
    assert avl.locator is not None and avl.locator.slide == 12
    assert "phép quay" in avl.snippet.casefold()
    assert avl.score == avl.best_match_score == 0.99
