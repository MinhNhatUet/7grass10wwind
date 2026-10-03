from __future__ import annotations

import pytest

from src.knowledge_hub import SearchFilters
from src.knowledge_hub.demo_data import build_demo_hub, demo_access_scope
from src.knowledge_hub.query import search_query


def test_search_query_uses_fixture_composition_by_default():
    response = search_query("cây AVL")
    assert response.mode == "hybrid"
    assert response.items
    assert response.items[0].version_id == "avl-v2"


def test_search_query_accepts_filters_and_browse_mode():
    response = search_query("", filters=SearchFilters(document_type="slide", topic="tree"))
    assert response.mode == "browse"
    assert [item.version_id for item in response.items] == ["avl-v2"]


def test_search_query_accepts_injected_agent_and_access():
    hub, _ = build_demo_hub()
    response = search_query("phép quay AVL", hub=hub, access=demo_access_scope())
    assert any(item.chunk_id == "c-avl-rotations" for item in response.items)


def test_search_query_requires_hub_and_access_as_a_pair():
    hub, _ = build_demo_hub()
    with pytest.raises(ValueError, match="provided together"):
        search_query("AVL", hub=hub)
