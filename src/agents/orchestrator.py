"""Graph điều phối ba trợ lý bằng LangGraph (FR-11; PRD 10.1, 10.3).

    START → policy ─┬─ redirect ──────────────────────────────────────────→ END  (integrity_redirect, BR-06)
                    └─ allow → router (chọn MÔN trong danh sách được phép + trợ lý) ─┬─ academic → END
                                                                                    ├─ learning → END
                                                                                    ├─ hub      → END
                                                                                    └─ clarify  → END
    Không xác định được môn → clarify, không truy xuất (BR-02, FR-01.3). Mode khác "auto" (qua API) chỉ ép trợ lý;
    router vẫn phải chốt môn (D-28).

Một yêu cầu đi qua tối đa 3 bước điều phối (policy, router, một trợ lý); recursion_limit chặn vòng lặp (FR-11.3/11.6).
Chưa làm yêu cầu nhiều bước phụ thuộc (chia một câu thành nhiều trợ lý) — giới hạn MVP.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from src.agents.nodes.orchestration import (
    academic_node,
    clarify_node,
    hub_node,
    learning_node,
    policy_node,
    router_node,
)
from src.agents.orchestrator_state import Mode, OrchestratorState
from src.models.orm import User
from src.services.assistants import AssistantResult

RECURSION_LIMIT = 8


def _after_policy(state: OrchestratorState) -> str:
    return END if state.get("integrity") == "redirect" else "router"


def _to_assistant(state: OrchestratorState) -> str:
    return state["route"]["assistant"]


@lru_cache
def build_orchestrator():  # noqa: ANN201
    g = StateGraph(OrchestratorState)
    g.add_node("policy", policy_node)
    g.add_node("router", router_node)
    g.add_node("clarify", clarify_node)
    g.add_node("academic", academic_node)
    g.add_node("learning", learning_node)
    g.add_node("hub", hub_node)
    g.add_edge(START, "policy")
    g.add_conditional_edges("policy", _after_policy, {END: END, "router": "router"})
    targets = {"academic": "academic", "learning": "learning", "hub": "hub", "clarify": "clarify"}
    g.add_conditional_edges("router", _to_assistant, targets)
    for node in ("academic", "learning", "hub", "clarify"):
        g.add_edge(node, END)
    return g.compile()


def run(
    *,
    db: Session,
    user: User,
    courses: list[tuple[str, str]],
    previous_course_id: str | None,
    request_id: str,
    question: str,
    history: list[tuple[str, str]],
    mode: Mode,
    options: dict[str, Any],
) -> tuple[AssistantResult, dict[str, Any]]:
    """Trả (kết quả trợ lý, trace điều phối để lưu và hiển thị "Router: đã chọn …")."""
    final = build_orchestrator().invoke(
        {
            "request_id": request_id,
            "courses": courses,
            "previous_course_id": previous_course_id,
            "course_id": None,
            "question": question,
            "history": history,
            "mode": mode,
            "options": options,
            "steps": [],
        },
        config={
            "configurable": {"db": db, "user": user},
            "recursion_limit": RECURSION_LIMIT,
        },
    )
    route = final.get("route") or {}
    trace = {
        "course_id": final.get("course_id"),
        "mode": "auto" if mode == "auto" else "manual",
        "assistant": route.get("assistant") if final.get("integrity") != "redirect" else "policy",
        "action": route.get("learning_action"),
        "reason": route.get("reason"),
        "steps": final.get("steps", []),
    }
    return final["result"], trace
