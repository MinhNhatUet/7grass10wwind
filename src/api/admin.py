"""Quản trị (UI-10; FR-01.4; PRD 5.1): cấp/khóa tài khoản, gán môn và quyền, khóa khẩn cấp tài liệu.

Mọi thay đổi lưu actor, thời gian, lý do (BR-11). Quản trị không đọc hội thoại/nội dung tài liệu (AC-01.6).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.api.deps import require_role
from src.config import get_settings
from src.db import get_db
from src.models.orm import ROLES, AuditEvent, Course, Document, Membership, UsageEvent, User
from src.services import audit, documents
from src.services.auth import get_auth_service, hash_password
from src.services.errors import bad_request, conflict, not_found

router = APIRouter(prefix="/admin")
admin_only = require_role("admin")


def _user_view(u: User) -> dict[str, Any]:
    return {
        "id": u.id, "login_id": u.login_id, "display_name": u.display_name, "role": u.role, "status": u.status,
        "memberships": [
            {"course_id": m.course_id, "can_read": m.can_read, "can_download": m.can_download, "can_upload": m.can_upload,
             "can_review": m.can_review, "valid_to": m.valid_to.isoformat() if m.valid_to else None}
            for m in u.memberships
        ],
    }  # fmt: skip


@router.get("/users")
def list_users(admin: User = Depends(admin_only), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"items": [_user_view(u) for u in db.scalars(select(User).order_by(User.role, User.login_id))]}


class CreateUser(BaseModel):
    login_id: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=200)
    role: str
    password: str = Field(min_length=8, max_length=200)
    reason: str = Field(min_length=1)


@router.post("/users", status_code=201)
def create_user(body: CreateUser, admin: User = Depends(admin_only), db: Session = Depends(get_db)) -> dict[str, Any]:
    if body.role not in ROLES:
        raise bad_request("INVALID_ROLE")
    if db.scalar(select(User.id).where(User.login_id == body.login_id)):
        raise conflict("LOGIN_ID_EXISTS")
    user = User(
        login_id=body.login_id,
        display_name=body.display_name,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.flush()
    audit.record(
        db,
        actor_id=admin.id,
        action="create_user",
        object_type="user",
        object_id=user.id,
        reason=body.reason,
        detail={"role": body.role},
    )
    db.commit()
    return _user_view(user)


class UpdateUser(BaseModel):
    status: str | None = Field(None, pattern="^(active|locked)$")
    role: str | None = None
    reason: str = Field(min_length=1)


@router.patch("/users/{user_id}")
def update_user(
    user_id: str, body: UpdateUser, admin: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict[str, Any]:
    user = db.get(User, user_id)
    if user is None:
        raise not_found()
    if user.id == admin.id and body.status == "locked":
        raise bad_request("CANNOT_LOCK_SELF")
    changes: dict[str, Any] = {}
    if body.status and body.status != user.status:
        changes["status"] = [user.status, body.status]
        user.status = body.status
        if body.status == "locked":
            get_auth_service().sessions.revoke_user(user.id)  # khóa có hiệu lực ngay trên phiên
    if body.role and body.role != user.role:
        if body.role not in ROLES:
            raise bad_request("INVALID_ROLE")
        changes["role"] = [user.role, body.role]
        user.role = body.role
    audit.record(
        db,
        actor_id=admin.id,
        action="update_user",
        object_type="user",
        object_id=user.id,
        reason=body.reason,
        detail=changes,
    )
    db.commit()
    return _user_view(user)


class MembershipIn(BaseModel):
    course_id: str
    can_read: bool = True
    can_download: bool = False
    can_upload: bool = False
    can_review: bool = False
    valid_to: datetime | None = None


class SetMemberships(BaseModel):
    memberships: list[MembershipIn]
    reason: str = Field(min_length=1)


@router.put("/users/{user_id}/memberships")
def set_memberships(
    user_id: str, body: SetMemberships, admin: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict[str, Any]:
    user = db.get(User, user_id)
    if user is None:
        raise not_found()
    for m in body.memberships:
        if db.get(Course, m.course_id) is None:
            raise bad_request("UNKNOWN_COURSE")
        if m.can_upload and user.role not in ("lecturer", "reviewer"):
            raise bad_request("UPLOAD_REQUIRES_LECTURER")
        if m.can_review and user.role != "reviewer":
            raise bad_request("REVIEW_REQUIRES_REVIEWER")
    before = _user_view(user)["memberships"]
    db.execute(delete(Membership).where(Membership.user_id == user.id))
    for m in body.memberships:
        db.add(Membership(user_id=user.id, **m.model_dump()))
    db.flush()
    db.refresh(user)
    audit.record(
        db, actor_id=admin.id, action="set_memberships", object_type="user", object_id=user.id, reason=body.reason,
        detail={"before": before, "after": [m.model_dump(mode="json") for m in body.memberships]},
    )  # fmt: skip
    db.commit()
    return _user_view(user)


@router.get("/courses")
def list_courses(admin: User = Depends(admin_only), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {
        "items": [
            {"id": c.id, "code": c.code, "name": c.name, "term": c.term, "status": c.status}
            for c in db.scalars(select(Course).order_by(Course.id))
        ]
    }


class CreateCourse(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=300)
    code: str | None = None
    term: str | None = None
    reason: str = Field(min_length=1)


@router.post("/courses", status_code=201)
def create_course(
    body: CreateCourse, admin: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict[str, Any]:
    if db.get(Course, body.id):
        raise conflict("COURSE_EXISTS")
    db.add(Course(id=body.id, name=body.name, code=body.code, term=body.term, status="confirmed"))
    audit.record(
        db,
        actor_id=admin.id,
        action="create_course",
        object_type="course",
        object_id=body.id,
        course_id=body.id,
        reason=body.reason,
    )
    db.commit()
    return {"id": body.id}


@router.get("/documents")
def list_documents(course_id: str, admin: User = Depends(admin_only), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Chỉ metadata để khóa khẩn cấp — không trả nội dung (AC-01.6)."""
    rows = db.scalars(select(Document).where(Document.course_id == course_id).order_by(Document.title))
    return {
        "items": [
            {
                "id": d.id,
                "title": d.title,
                "doc_type": d.doc_type,
                "current_version_id": d.current_version_id,
                "emergency_locked": d.emergency_locked,
            }
            for d in rows
        ]
    }


class LockBody(BaseModel):
    locked: bool
    reason: str = Field(min_length=1)


@router.post("/documents/{document_id}/lock")
def lock_document(
    document_id: str, body: LockBody, admin: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict[str, Any]:
    d = documents.emergency_lock(db, admin, document_id, body.locked, body.reason)
    return {"id": d.id, "emergency_locked": d.emergency_locked}


@router.get("/audit")
def audit_log(
    limit: int = Query(200, ge=1, le=1000), admin: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict[str, Any]:
    rows = db.scalars(select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit))
    names = {u.id: u.display_name for u in db.scalars(select(User))}
    return {
        "items": [
            {"action": e.action, "object_type": e.object_type, "object_id": e.object_id, "course_id": e.course_id,
             "actor": names.get(e.actor_id or "", "hệ thống"), "reason": e.reason, "detail": e.detail,
             "created_at": e.created_at.isoformat(timespec="seconds")}
            for e in rows
        ]
    }  # fmt: skip


@router.get("/costs")
def costs(
    days: int = Query(30, ge=1, le=365), admin: User = Depends(admin_only), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Chi phí AI ước tính (D-60): token × bảng giá trong cấu hình, gộp theo ngày / trợ lý / môn / người dùng.
    Chỉ số liệu vận hành — không đọc nội dung hội thoại (AC-01.6)."""
    s = get_settings()
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.execute(
        select(UsageEvent.created_at, UsageEvent.user_id, UsageEvent.course_id, UsageEvent.assistant,
               UsageEvent.status, UsageEvent.tokens_input, UsageEvent.tokens_output, UsageEvent.estimated_cost)
        .where(UsageEvent.created_at >= since)
    ).all()  # fmt: skip
    users = {u.id: f"{u.display_name} ({u.login_id})" for u in db.scalars(select(User))}
    courses = {c.id: c.name for c in db.scalars(select(Course))}

    def bucket() -> dict[str, Any]:
        return {"requests": 0, "tokens_input": 0, "tokens_output": 0, "cost_usd": 0.0}

    total, by_day = bucket(), {}
    groups: dict[str, dict[str, dict[str, Any]]] = {"assistant": {}, "course": {}, "user": {}}
    untracked = 0
    for r in rows:
        tin, tout, cost = r.tokens_input or 0, r.tokens_output or 0, r.estimated_cost or 0.0
        untracked += not (tin or tout)  # lượt ghi trước D-60 (chưa đếm token)
        keys = {"assistant": r.assistant or "khác", "course": courses.get(r.course_id or "", "Chưa xác định môn"),
                "user": users.get(r.user_id, r.user_id)}  # fmt: skip
        day = r.created_at.date().isoformat()
        for b in (
            total,
            by_day.setdefault(day, bucket()),
            *(groups[g].setdefault(k, bucket()) for g, k in keys.items()),
        ):
            b["requests"] += 1
            b["tokens_input"] += tin
            b["tokens_output"] += tout
            b["cost_usd"] += cost

    def ranked(g: str, limit: int = 20) -> list[dict[str, Any]]:
        return sorted(({"name": k, **v} for k, v in groups[g].items()), key=lambda x: -x["cost_usd"])[:limit]

    return {
        "days": days,
        "pricing": {
            "model": s.llm_model,
            "input_per_1m_usd": s.llm_price_input_per_1m,
            "output_per_1m_usd": s.llm_price_output_per_1m,
            "usd_to_vnd": s.usd_to_vnd,
        },
        "total": total | {"cost_vnd": total["cost_usd"] * s.usd_to_vnd, "untracked_requests": untracked},
        "by_day": [{"date": d, **v} for d, v in sorted(by_day.items())],
        "by_assistant": ranked("assistant"),
        "by_course": ranked("course"),
        "top_users": ranked("user", 10),
    }
