from __future__ import annotations

from dataclasses import replace

import pytest

from src.knowledge_hub import (
    AccessScope,
    HubSearchRequest,
    InvalidRequest,
    ScopeDenied,
    SourceNotFound,
    SourceUnavailable,
)


def test_resolve_source_returns_matching_excerpt_locator_and_download_flag(hub_bundle):
    hub, _, access = hub_bundle
    source = hub.resolve_source("avl-v2", "c-avl-rotations", access)
    assert source.document_id == "doc-avl"
    assert source.locator is not None and source.locator.slide == 12
    assert "quay trái" in source.excerpt
    assert source.can_download is True


def test_resolve_source_without_chunk_does_not_invent_excerpt_or_locator(hub_bundle):
    hub, _, access = hub_bundle
    source = hub.resolve_source("avl-v2", None, access)
    assert source.excerpt is None
    assert source.locator is None


def test_chunk_from_another_version_is_rejected(hub_bundle):
    hub, _, access = hub_bundle
    with pytest.raises(SourceNotFound):
        hub.resolve_source("avl-v2", "c-bst-search", access)


def test_version_losing_access_after_search_cannot_be_resolved(hub_bundle):
    hub, _, access = hub_bundle
    response = hub.search(HubSearchRequest(query="cây AVL", course_id="ctdl"), access)
    assert any(item.version_id == "avl-v2" for item in response.items)
    revoked_access = AccessScope(
        user_id=access.user_id,
        allowed_course_ids={"ctdl"},
        allowed_version_ids={"bst-v1"},
    )
    with pytest.raises(ScopeDenied):
        hub.resolve_source("avl-v2", "c-avl-definition", revoked_access)


def test_version_withdrawn_after_search_cannot_be_resolved(hub_bundle):
    hub, dependencies, access = hub_bundle
    response = hub.search(HubSearchRequest(query="cây AVL", course_id="ctdl"), access)
    assert any(item.version_id == "avl-v2" for item in response.items)

    catalog = dependencies["catalog"]
    current = catalog.get_version("avl-v2")
    catalog.upsert_version(replace(current, withdrawn=True))
    with pytest.raises(SourceUnavailable):
        hub.resolve_source("avl-v2", "c-avl-definition", access)


def test_blank_source_identifiers_are_invalid(hub_bundle):
    hub, _, access = hub_bundle
    with pytest.raises(InvalidRequest):
        hub.resolve_source(" ", None, access)
    with pytest.raises(InvalidRequest):
        hub.resolve_source("avl-v2", " ", access)
