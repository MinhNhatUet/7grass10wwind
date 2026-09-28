"""State điều phối ba trợ lý (PRD 10.3, FR-11.4).

State chỉ chứa dữ liệu; phạm vi quyền (db session, user, hội thoại) do backend cấp qua
``config["configurable"]`` — node không tự mở rộng quyền và không đọc role từ client (BR-02).
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from src.services.assistants import AssistantResult

Mode = Literal["auto", "academic", "learning", "hub"]


class RouteDecision(TypedDict, total=False):
    course_id: str | None  # môn router chọn — luôn thuộc danh sách môn backend cho phép (BR-02)
    assistant: Literal["academic", "learning", "hub", "clarify"]
    learning_action: str | None  # explain|analogy|quiz|diagnose|flashcards|cloze|triage|plan
    analogy_context: str | None
    search_terms: str | None
    level: str | None
    goal: str | None
    topic: str | None
    days: int | None
    minutes_per_day: int | None
    clarification: str | None
    reason: str


class OrchestratorState(TypedDict, total=False):
    request_id: str
    courses: list[tuple[str, str]]  # (id, tên) môn user được đọc — backend cấp, router chỉ chọn trong đây
    previous_course_id: str | None  # môn của lượt trước trong hội thoại (gợi ý cho câu nối tiếp)
    course_id: str | None  # môn đã chốt sau router
    question: str
    history: list[tuple[str, str]]
    mode: Mode  # "auto" = router chọn; còn lại = người dùng chuyển thủ công (FR-11.5)
    options: dict[str, Any]  # tham số Learning người dùng nhập tay (ghi đè giá trị router rút ra)
    integrity: Literal["allow", "redirect"]
    route: RouteDecision
    steps: list[str]  # trace các bước đã chạy (AC-11.5)
    result: AssistantResult
