"""API hội thoại, lịch sử, tự kiểm tra, lộ trình (PRD 11.2–11.5; FR-02, FR-03, FR-05)."""

from __future__ import annotations

from datetime import date, time
from typing import Any

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.deps import Idempotency, current_user, idempotency_key
from src.db import get_db
from src.models.orm import Conversation, User
from src.services import conversations as svc
from src.services.errors import AppError
from src.services.plan_calendar import plan_ics

router = APIRouter()


def conv_view(c: Conversation) -> dict[str, Any]:
    return {
        "id": c.id,
        "course_id": c.course_id,
        "document_id": c.document_id,
        "assistant_mode": c.assistant_mode,
        "title": c.title,
        "created_at": svc._iso(c.created_at),
        "updated_at": svc._iso(c.updated_at),
    }


class CreateConversation(BaseModel):
    course_id: str | None = None  # None = router chọn môn theo từng câu hỏi (D-28)
    assistant: str = Field("auto", pattern="^(auto|academic|learning|hub)$")
    title: str | None = None
    document_id: str | None = None


@router.post("/conversations", status_code=201)
def create(
    body: CreateConversation, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    conv = svc.create(db, user, body.course_id, body.assistant, body.title, body.document_id)
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


@router.delete("/conversations")
def delete_all(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, int]:
    """Xóa toàn bộ lịch sử của người đang đăng nhập (không nhận owner từ client, BR-02)."""
    return {"deleted": svc.delete_all(db, user)}


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
    action: str = Field("explain", pattern="^(explain|quiz|plan|mcq|flashcards|cloze|diagnose)$")
    level: str | None = Field(None, pattern="^(short|step|detailed)$")
    topic: str | None = None
    goal: str | None = None
    days: int | None = None
    minutes_per_day: int | None = None
    previous_plan_id: str | None = None
    plan_id: str | None = None
    count: int | None = Field(
        None, ge=3, le=20
    )  # số câu/thẻ người học chọn khi ôn tập  # D-37: ôn tập một buổi của lộ trình → server lấy môn từ lộ trình


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
    conv = svc.get_owned(db, user, conversation_id)
    idem = Idempotency(db, user, f"message:{conversation_id}", key, payload)
    if (replayed := idem.replay()) is not None:
        return svc.replay(db, user, conv, replayed)
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


@router.get("/learning/plans/{plan_id}/calendar.ics")
def plan_calendar(
    plan_id: str,
    start: date,
    at: time = time(19, 0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    """D-37: xuất lộ trình ĐÃ XÁC NHẬN ra iCalendar để nhập Google Calendar (chỉ chủ sở hữu, AC-03.10)."""
    plan = svc.get_plan(db, user, plan_id)
    if plan.status not in ("Confirmed", "InProgress", "Paused"):
        raise AppError("PLAN_NOT_ACTIVE", 409)
    return Response(
        plan_ics(plan, start, at),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="lo-trinh-{plan.id}.ics"', "Cache-Control": "no-store"},
    )


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


class PlanSessionEdit(BaseModel):
    id: str | None = Field(None, max_length=20)  # None = buổi mới
    day: int = Field(ge=1, le=60)
    title: str = Field(min_length=1, max_length=200)
    objective: str = Field("", max_length=1000)
    activity: str = Field("", max_length=1000)
    self_check: str = Field("", max_length=1000)
    minutes: int = Field(ge=5, le=600)


class PlanEdit(BaseModel):
    goal: str = Field(min_length=1, max_length=2000)
    sessions: list[PlanSessionEdit] = Field(min_length=1, max_length=60)


@router.put("/learning/plans/{plan_id}")
def edit_plan(
    plan_id: str, body: PlanEdit, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    sessions = [s.model_dump() for s in body.sessions]
    return svc.plan_view(db, user, svc.update_plan(db, user, plan_id, body.goal.strip(), sessions))


@router.delete("/learning/plans/{plan_id}", status_code=204)
def delete_plan(plan_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> None:
    svc.delete_plan(db, user, plan_id)


class PlanStatus(BaseModel):
    status: str


@router.post("/learning/plans/{plan_id}/status")
def plan_status(
    plan_id: str, body: PlanStatus, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.plan_view(db, user, svc.set_plan_status(db, user, plan_id, body.status))
