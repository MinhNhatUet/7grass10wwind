"""Terminal demo: ``python -m src.knowledge_hub.demo``."""

from __future__ import annotations

from src.knowledge_hub.demo_data import build_demo_hub, demo_access_scope
from src.knowledge_hub.errors import ScopeDenied
from src.knowledge_hub.models import HubSearchRequest, SearchFilters


def _print_response(label: str, response) -> None:
    print(f"\n{label} | mode={response.mode} | total={response.total}")
    for index, item in enumerate(response.items, start=1):
        locator = item.locator or "không có"
        print(f"{index}. {item.title} — {item.version_label}")
        print(f"   chunk: {item.chunk_id}; locator: {locator}; score: {item.score}")
        print(f"   snippet: {item.snippet or '(browse mode)'}")
        print(f"   downloadable: {item.can_download}")


def main() -> None:
    access = demo_access_scope()
    hub, _ = build_demo_hub()

    hybrid = hub.search(HubSearchRequest(query="slide nói về cây AVL", course_id="ctdl"), access)
    _print_response("1. Hybrid + reranker", hybrid)

    browse = hub.search(
        HubSearchRequest(
            query="  ",
            course_id="ctdl",
            filters=SearchFilters(document_type="slide", topic="tree"),
        ),
        access,
    )
    _print_response("2. Browse + metadata filter", browse)

    try:
        hub.search(HubSearchRequest(query="SQL", course_id="csdl"), access)
    except ScopeDenied as error:
        print(f"\n3. Course ngoài quyền: {type(error).__name__}")

    stale = hub.search(HubSearchRequest(query="height imbalance AVL bản cũ", course_id="ctdl"), access)
    _print_response("4. Stale Withdrawn candidate đã bị loại", stale)
    print(f"   filtered reasons: {stale.trace.filtered_reason_counts if stale.trace else {}}")

    fallback_hub, _ = build_demo_hub(reranker_fail=True)
    fallback = fallback_hub.search(HubSearchRequest(query="cây AVL", course_id="ctdl"), access)
    _print_response("5. Reranker failure fallback", fallback)
    print(f"   reranker_fallback: {fallback.trace.reranker_fallback if fallback.trace else False}")


if __name__ == "__main__":
    main()
