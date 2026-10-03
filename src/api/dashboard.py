"""Dashboard Giảng viên (UI-09; FR-12) và /metrics (PRD 11.2). Chỉ môn phụ trách (AC-12.1)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.deps import current_user
from src.db import get_db
from src.models.orm import AuditEvent, Document, DocumentVersion, Feedback, UsageEvent, User
from src.services import acl
from src.services.errors import AppError, bad_request, not_found
from src.services.formatting import iso

router = APIRouter()


def _require_manage(db: Session, user: User, course_id: str) -> None:
    if not acl.can_manage_course(db, user, course_id):
        raise AppError("FORBIDDEN", 403)


def usage_stats(
    db: Session, since: datetime, course_ids: list[str] | None = None, user_id: str | None = None
) -> dict[str, Any]:
    stmt = select(UsageEvent.status, func.count()).where(UsageEvent.created_at >= since).group_by(UsageEvent.status)
    if course_ids is not None:
        stmt = stmt.where(UsageEvent.course_id.in_(course_ids))
    if user_id is not None:
        stmt = stmt.where(UsageEvent.user_id == user_id)
    by_status = {s: n for s, n in db.execute(stmt).all()}
    lat_stmt = select(UsageEvent.latency_ms).where(UsageEvent.created_at >= since, UsageEvent.latency_ms.is_not(None))
    if course_ids is not None:
        lat_stmt = lat_stmt.where(UsageEvent.course_id.in_(course_ids))
    if user_id is not None:
        lat_stmt = lat_stmt.where(UsageEvent.user_id == user_id)
    lat = sorted(db.scalars(lat_stmt))
    p95 = lat[max(0, -(-len(lat) * 95 // 100) - 1)] if lat else None
    return {
        "total_queries": sum(by_status.values()),
        "by_status": by_status,
        "latency_p95_ms": round(p95) if p95 else None,
    }


@router.get("/dashboard/courses")
def managed_courses(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"items": acl.managed_course_ids(db, user)}


@router.get("/dashboard/overview")
def overview(
    course_id: str, days: int = Query(7, ge=1, le=90), user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    _require_manage(db, user, course_id)
    states = dict(
        db.execute(
            select(DocumentVersion.state, func.count())
            .join(Document)
            .where(Document.course_id == course_id)
            .group_by(DocumentVersion.state)
        ).all()
    )
    fb = dict(
        db.execute(
            select(Feedback.status, func.count()).where(Feedback.course_id == course_id).group_by(Feedback.status)
        ).all()
    )
    since = datetime.now(UTC) - timedelta(days=days)
    stats = usage_stats(db, since, [course_id])
    return {
        "course_id": course_id,
        "window_days": days,
        "documents_by_state": states,
        "review_queue": states.get("PendingApproval", 0),
        "feedback_by_status": fb,
        "usage": stats,
        "source_gaps": {
            "insufficient_evidence": stats["by_status"].get("insufficient_evidence", 0),
            "note": "Chỉ đếm tổng hợp; không mở câu hỏi riêng của Sinh viên (FR-12, BR-10).",
        },
        "eval": None,  # FR-12.4: chưa đo → hiển thị "chưa có dữ liệu", không điền số demo
    }


@router.get("/dashboard/history")
def history(
    course_id: str,
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _require_manage(db, user, course_id)
    rows = db.scalars(
        select(AuditEvent).where(AuditEvent.course_id == course_id).order_by(AuditEvent.created_at.desc()).limit(limit)
    )
    names = {u.id: u.display_name for u in db.scalars(select(User))}
    return {
        "items": [
            {"action": e.action, "object_type": e.object_type, "object_id": e.object_id, "actor": names.get(e.actor_id or "", "hệ thống"),
             "reason": e.reason, "detail": e.detail, "created_at": iso(e.created_at)}
            for e in rows
        ]
    }  # fmt: skip


@router.get("/dashboard/feedback")
def list_feedback(
    course_id: str, status: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    _require_manage(db, user, course_id)
    stmt = select(Feedback).where(Feedback.course_id == course_id).order_by(Feedback.created_at.desc())
    if status:
        stmt = stmt.where(Feedback.status == status)
    items = []
    for f in db.scalars(stmt):
        items.append(
            {
                "id": f.id, "type": f.type, "note": f.note, "status": f.status, "assignee_id": f.assignee_id,
                "resolution_note": f.resolution_note, "created_at": iso(f.created_at), "updated_at": iso(f.updated_at),
                # AC-12.2: nội dung chỉ có khi người dùng chủ động chia sẻ; không trả answer ID để truy ngược hội thoại
                "shared": {"question": f.shared_question, "answer": f.shared_answer} if f.share_content else None,
            }
        )  # fmt: skip
    return {"items": items}


class FeedbackUpdate(BaseModel):
    status: str
    resolution_note: str | None = None


@router.patch("/dashboard/feedback/{feedback_id}")
def update_feedback(
    feedback_id: str, body: FeedbackUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """FR-12.2: Open → InProgress → Resolved (mở lại được); không tự cập nhật nguồn (AC-12.3)."""
    if body.status not in ("Open", "InProgress", "Resolved"):
        raise bad_request("INVALID_STATUS")
    f = db.get(Feedback, feedback_id)
    if f is None or not acl.can_manage_course(db, user, f.course_id):
        raise not_found()
    f.status, f.assignee_id = body.status, user.id
    if body.resolution_note is not None:
        f.resolution_note = body.resolution_note[:2000]
    from src.services import audit

    audit.record(
        db,
        actor_id=user.id,
        action=f"feedback_{body.status.lower()}",
        object_type="feedback",
        object_id=f.id,
        course_id=f.course_id,
        reason=body.resolution_note,
    )
    db.commit()
    return {"id": f.id, "status": f.status}


@router.get("/metrics")
def metrics(
    days: int = Query(7, ge=1, le=90), user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """PRD 11.2: Student (của mình), Teacher (môn phụ trách), Admin (hệ thống); không lộ ngoài scope."""
    since = datetime.now(UTC) - timedelta(days=days)
    if user.role == "admin":
        return {"scope": "system", "window_days": days, **usage_stats(db, since)}
    if user.role in acl.STAFF_ROLES:
        courses = acl.managed_course_ids(db, user)
        return {"scope": "courses", "courses": courses, "window_days": days, **usage_stats(db, since, courses)}
    return {"scope": "self", "window_days": days, **usage_stats(db, since, user_id=user.id)}
