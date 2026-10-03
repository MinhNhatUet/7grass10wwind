from __future__ import annotations

from src.knowledge_hub import AccessScope, HubSearchRequest, SearchFilters


def test_blank_query_uses_browse_without_retrieval_dependencies(hub_bundle):
    hub, dependencies, access = hub_bundle
    response = hub.search(HubSearchRequest(query=" \n ", course_id="ctdl"), access)

    assert response.mode == "browse"
    assert dependencies["embedding"].call_count == 0
    assert dependencies["vector_store"].call_count == 0
    assert dependencies["lexical_store"].call_count == 0
    assert dependencies["reranker"].call_count == 0


def test_browse_applies_course_access_status_and_count(hub_bundle):
    hub, _, access = hub_bundle
    response = hub.search(HubSearchRequest(query=None, course_id="ctdl"), access)

    assert response.total == 3
    assert {item.version_id for item in response.items} == {"avl-v2", "bst-v1", "sorting-v1"}
    assert all(item.course_id == "ctdl" and item.can_view for item in response.items)
    assert "pending-v1" not in {item.version_id for item in response.items}
    assert "avl-v1" not in {item.version_id for item in response.items}
    assert "private-v1" not in {item.version_id for item in response.items}


def test_browse_metadata_filters_document_type_topic_chapter_semester(hub_bundle):
    hub, _, access = hub_bundle
    response = hub.search(
        HubSearchRequest(
            query=None,
            course_id="ctdl",
            filters=SearchFilters(document_type="slide", topic="tree", chapter="5", semester="2026A"),
        ),
        access,
    )
    assert [item.version_id for item in response.items] == ["avl-v2"]


def test_pagination_is_disjoint_counts_only_eligible_and_allows_empty_page(hub_bundle):
    hub, _, access = hub_bundle
    first = hub.search(HubSearchRequest(query=None, course_id="ctdl", page=1, page_size=1), access)
    second = hub.search(HubSearchRequest(query=None, course_id="ctdl", page=2, page_size=1), access)
    empty = hub.search(HubSearchRequest(query=None, course_id="ctdl", page=99, page_size=1), access)

    assert first.total == second.total == empty.total == 3
    assert first.items[0].version_id != second.items[0].version_id
    assert empty.items == []


def test_none_version_scope_means_all_eligible_versions_in_allowed_course(hub_bundle):
    hub, _, _ = hub_bundle
    access = AccessScope(user_id="u", allowed_course_ids={"ctdl"})
    response = hub.search(HubSearchRequest(query=None, course_id="ctdl"), access)
    assert response.total == 4
    assert "private-v1" in {item.version_id for item in response.items}
