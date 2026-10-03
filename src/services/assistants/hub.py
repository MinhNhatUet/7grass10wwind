"""Knowledge Hub (FR-04): tìm tài liệu trong phạm vi môn, không gọi generation (FR-04 ngoại lệ)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from src.knowledge_hub import HubSearchRequest
from src.models.orm import User
from src.services.assistants import AssistantResult
from src.services.knowledge_hub_database import hub_response_view, search_database_session
from src.services.policy import HUB_EMPTY_MESSAGE

HUB_TOP_K = 20


def find(db: Session, user: User, course_id: str, query: str) -> AssistantResult:
    response = search_database_session(
        db,
        user,
        HubSearchRequest(query=query, course_id=course_id, page=1, page_size=HUB_TOP_K),
    )
    results = hub_response_view(db, response)["items"]
    if not results:
        return AssistantResult(
            status="insufficient_evidence", content=HUB_EMPTY_MESSAGE, payload={"kind": "hub", "results": []}
        )
    return AssistantResult(
        status="answered",
        content=f"Tìm thấy {len(results)} tài liệu phù hợp trong môn đang chọn.",
        payload={"kind": "hub", "results": results},
    )
