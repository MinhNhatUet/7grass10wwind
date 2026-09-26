"""API hội thoại, lịch sử, tự kiểm tra, lộ trình (PRD 11.2–11.5; FR-02, FR-03, FR-05)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.deps import Idempotency, current_user, idempotency_key
from src.db import get_db
from src.models.orm import Conversation, User
from src.services import conversations as svc

router = APIRouter()


def conv_view(c: Conversation) -> dict[str, Any]:
    return {
        "id": c.id,
        "course_id": c.course_id,
        "assistant_mode": c.assistant_mode,
        "title": c.title,
        "created_at": svc._iso(c.created_at),
        "updated_at": svc._iso(c.updated_at),
    }


class CreateConversation(BaseModel):
    course_id: str | None = None  # None = router chọn môn theo từng câu hỏi (D-28)
    assistant: str = Field("auto", pattern="^(auto|academic|learning|hub)$")
    title: str | None = None


@router.post("/conversations", status_code=201)
def create(
    body: CreateConversation, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    conv = svc.create(db, user, body.course_id, body.assistant, body.title)
    return {"conversation_id": conv.id, **conv_view(conv)}


@router.get("/conversations")
def list_conversations(
    limit: int = Query(20, ge=1, le=100),
    cursor: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rows, nxt = svc.list_owned(db, user, limit, cursor)
    return {"items": [conv_view(c) for c in rows], "next_cursor": nxt}


@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return conv_view(svc.get_owned(db, user, conversation_id))


class Rename(BaseModel):
    title: str = Field(min_length=1, max_length=300)


@router.patch("/conversations/{conversation_id}")
def rename(
    conversation_id: str, body: Rename, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return conv_view(svc.rename(db, user, conversation_id, body.title))


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete(conversation_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> None:
    svc.delete(db, user, conversation_id)


@router.get("/conversations/{conversation_id}/messages")
def messages(
    conversation_id: str,
    limit: int = Query(30, ge=1, le=100),
    cursor: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, nxt = svc.list_messages(db, user, conversation_id, limit, cursor)
    return {"items": items, "next_cursor": nxt}


class LearningOptions(BaseModel):
    action: str = Field("explain", pattern="^(explain|quiz|plan)$")
    level: str | None = Field(None, pattern="^(short|step|detailed)$")
    topic: str | None = None
    goal: str | None = None
    days: int | None = None
    minutes_per_day: int | None = None
    previous_plan_id: str | None = None


class SendMessage(BaseModel):
    content: str = Field(min_length=1)
    assistant: str | None = Field(None, pattern="^(auto|academic|learning|hub)$")  # None = auto (router)
    learning: LearningOptions | None = None


@router.post("/conversations/{conversation_id}/messages")
def send(
    conversation_id: str,
    body: SendMessage,
    key: str | None = Depends(idempotency_key),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Business result (answered/partial/...) trả HTTP 200; chỉ lỗi kỹ thuật mới là 4xx/5xx (PRD 11.4)."""
    payload = body.model_dump()
    idem = Idempotency(db, user, f"message:{conversation_id}", key, payload)
    if (replayed := idem.replay()) is not None:
        return replayed
    resp = svc.send(db, user, conversation_id, payload, key)
    idem.store(resp)
    db.commit()
    return resp


class QuizAnswers(BaseModel):
    answers: dict[str, str]
    submit: bool = False


@router.post("/learning/quizzes/{message_id}/answers")
def quiz_answers(
    message_id: str, body: QuizAnswers, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.save_quiz_answers(db, user, message_id, body.answers, body.submit)


@router.get("/learning/plans/{plan_id}")
def get_plan(plan_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.plan_view(db, user, svc.get_plan(db, user, plan_id))


@router.post("/learning/plans/{plan_id}/confirm")
def confirm_plan(plan_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.plan_view(db, user, svc.confirm_plan(db, user, plan_id))


class SessionStatus(BaseModel):
    status: str


@router.patch("/learning/plans/{plan_id}/sessions/{session_id}")
def session_status(
    plan_id: str,
    session_id: str,
    body: SessionStatus,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return svc.plan_view(db, user, svc.update_session(db, user, plan_id, session_id, body.status))


class PlanStatus(BaseModel):
    status: str


@router.post("/learning/plans/{plan_id}/status")
def plan_status(
    plan_id: str, body: PlanStatus, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.plan_view(db, user, svc.set_plan_status(db, user, plan_id, body.status))
