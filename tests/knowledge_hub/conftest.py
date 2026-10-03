from __future__ import annotations

import pytest

from src.knowledge_hub.demo_data import build_demo_hub, demo_access_scope, load_fixture_data


@pytest.fixture
def hub_bundle():
    hub, dependencies = build_demo_hub()
    return hub, dependencies, demo_access_scope()


@pytest.fixture
def fixture_data():
    return load_fixture_data()
