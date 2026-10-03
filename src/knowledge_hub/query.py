"""Convenience function and CLI for trying one query against fixture data."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from src.knowledge_hub.agent import KnowledgeHubAgent
from src.knowledge_hub.demo_data import build_demo_hub, demo_access_scope
from src.knowledge_hub.models import AccessScope, HubSearchRequest, HubSearchResponse, SearchFilters


def search_query(
    query: str,
    *,
    course_id: str = "ctdl",
    filters: SearchFilters | None = None,
    page: int = 1,
    page_size: int = 10,
    hub: KnowledgeHubAgent | None = None,
    access: AccessScope | None = None,
) -> HubSearchResponse:
    """Run one query and return the core response.

    When ``hub`` and ``access`` are omitted, the function composes the standalone
    in-memory adapters and fixture access scope. Production callers can inject
    their own agent and already-resolved access scope without changing the call.
    """
    if (hub is None) != (access is None):
        raise ValueError("hub and access must be provided together")
    if hub is None:
        hub, _ = build_demo_hub()
        access = demo_access_scope()

    return hub.search(
        HubSearchRequest(
            query=query,
            course_id=course_id,
            filters=filters or SearchFilters(),
            page=page,
            page_size=page_size,
        ),
        access,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Search Knowledge Hub fixture data")
    parser.add_argument("query", help="Query text; pass an empty string for browse mode")
    parser.add_argument("--course", default="ctdl", dest="course_id")
    parser.add_argument("--document-type")
    parser.add_argument("--topic")
    parser.add_argument("--chapter")
    parser.add_argument("--semester")
    parser.add_argument("--version")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--page-size", type=int, default=10)
    arguments = parser.parse_args()

    response = search_query(
        arguments.query,
        course_id=arguments.course_id,
        filters=SearchFilters(
            document_type=arguments.document_type,
            topic=arguments.topic,
            chapter=arguments.chapter,
            semester=arguments.semester,
            version=arguments.version,
        ),
        page=arguments.page,
        page_size=arguments.page_size,
    )
    print(json.dumps(asdict(response), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
