from __future__ import annotations

import pytest

from src.knowledge_hub import (
    AccessScope,
    HubConfig,
    HubSearchRequest,
    InvalidRequest,
    ScopeDenied,
    SearchFilters,
)
from src.knowledge_hub.models import DocumentVersion
from src.knowledge_hub.policies import can_download


def test_fixture_has_required_document_version_and_chunk_coverage(fixture_data):
    versions, chunks = fixture_data
    assert len({version.document_id for version in versions}) >= 6
    assert len(versions) >= 8
    assert len(chunks) >= 15
    assert {version.course_id for version in versions} >= {"ctdl", "csdl"}
    assert {version.status for version in versions} >= {"Published", "PendingApproval", "Withdrawn"}


def test_course_outside_access_scope_is_rejected_without_results(hub_bundle):
    hub, _, access = hub_bundle
    with pytest.raises(ScopeDenied):
        hub.search(HubSearchRequest(query="SQL", course_id="csdl"), access)


@pytest.mark.parametrize(
    ("page", "page_size"),
    [(0, 10), (-1, 10), (1, 0), (1, -3), (1, 51)],
)
def test_invalid_pagination_raises_domain_error(hub_bundle, page, page_size):
    hub, _, access = hub_bundle
    with pytest.raises(InvalidRequest):
        hub.search(HubSearchRequest(query=None, course_id="ctdl", page=page, page_size=page_size), access)


def test_blank_course_is_rejected(hub_bundle):
    hub, _, access = hub_bundle
    with pytest.raises(InvalidRequest):
        hub.search(HubSearchRequest(query=None, course_id="  "), access)


def test_access_scope_is_immutable_from_caller_sets():
    courses = {"ctdl"}
    access = AccessScope(user_id="u1", allowed_course_ids=courses)
    courses.add("csdl")
    assert access.allowed_course_ids == frozenset({"ctdl"})


def test_download_requires_read_scope_download_scope_and_metadata(fixture_data):
    versions, _ = fixture_data
    by_id = {version.version_id: version for version in versions}
    access = AccessScope(
        user_id="u1",
        allowed_course_ids={"ctdl"},
        allowed_version_ids={"avl-v2", "bst-v1", "sorting-v1"},
        downloadable_version_ids={"avl-v2", "bst-v1"},
    )
    assert can_download(by_id["avl-v2"], access) is True
    assert can_download(by_id["bst-v1"], access) is False
    assert can_download(by_id["sorting-v1"], access) is False


def test_download_is_default_deny_without_download_scope():
    version = DocumentVersion(
        document_id="d",
        version_id="v",
        course_id="c",
        title="T",
        document_type=None,
        version_label=None,
        status="Published",
        withdrawn=False,
        can_download_default=True,
    )
    access = AccessScope(user_id="u", allowed_course_ids={"c"})
    assert can_download(version, access) is False


def test_config_rejects_invalid_limits():
    with pytest.raises(ValueError):
        HubConfig(rerank_top_k=0)
    with pytest.raises(ValueError):
        HubConfig(default_page_size=20, max_page_size=10)


def test_version_filter_matches_label_not_version_id(hub_bundle):
    hub, _, access = hub_bundle
    response = hub.search(
        HubSearchRequest(query=None, course_id="ctdl", filters=SearchFilters(version="v2")),
        access,
    )
    assert [item.version_id for item in response.items] == ["avl-v2"]
