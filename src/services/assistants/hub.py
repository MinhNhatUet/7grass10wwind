"""Knowledge Hub (FR-04): tìm tài liệu trong phạm vi môn, không gọi generation (FR-04 ngoại lệ)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from src.models.orm import User
from src.services.assistants import AssistantResult
from src.services.policy import HUB_EMPTY_MESSAGE
from src.services.retrieval import search

HUB_TOP_K = 20
SNIPPET_CHARS = 280


def find(db: Session, user: User, course_id: str, query: str) -> AssistantResult:
    hits = search(db, user, course_id, query, k=HUB_TOP_K)
    best: dict[str, dict] = {}
    for h in hits:  # hits đã sắp theo điểm giảm dần; giữ đoạn tốt nhất mỗi tài liệu
        if h.document.id in best:
            continue
        best[h.document.id] = {
            "document_id": h.document.id,
            "version_id": h.version.id,
            "chunk_id": h.chunk.id,
            "title": h.document.title,
            "doc_type": h.document.doc_type,
            "version_label": h.version.version_label,
            "chapter": h.version.chapter,
            "snippet": h.chunk.text[:SNIPPET_CHARS],
            "locator": {"type": h.chunk.locator_type, "value": h.chunk.locator_value},
            "can_download": False,  # tính ở API theo quyền tải riêng
        }
    results = list(best.values())
    if not results:
        return AssistantResult(
            status="insufficient_evidence", content=HUB_EMPTY_MESSAGE, payload={"kind": "hub", "results": []}
        )
    return AssistantResult(
        status="answered",
        content=f"Tìm thấy {len(results)} tài liệu phù hợp trong môn đang chọn.",
        payload={"kind": "hub", "results": results},
    )
