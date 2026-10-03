"""Ghi audit (BR-11). Chỉ thêm, không có hàm sửa/xóa."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from src.models.orm import AuditEvent


def record(
    db: Session,
    *,
    actor_id: str | None,
    action: str,
    object_type: str,
    object_id: str,
    course_id: str | None = None,
    reason: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditEvent(
            actor_id=actor_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            course_id=course_id,
            reason=reason,
            detail=detail or {},
        )
    )
