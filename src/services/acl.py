"""Phân quyền theo PRD 5.1, mặc định từ chối (BR-01/02/03/06).

Mọi hàm nhận User lấy từ DB ở request hiện tại — không dùng role do client gửi.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.orm import PUBLISHED, RESTRICTED_FOR_STUDENTS, Course, Document, DocumentVersion, Membership, User

STAFF_ROLES = ("lecturer", "reviewer")


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def active_membership(db: Session, user: User, course_id: str) -> Membership | None:
    m = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.course_id == course_id))
    if m is None:
        return None
    valid_to = _aware(m.valid_to)
    if valid_to is not None and valid_to <= datetime.now(UTC):
        return None
    return m


def readable_course_ids(db: Session, user: User) -> list[str]:
    """Hỏi đáp/tìm tài liệu: SV theo membership; GV/GV duyệt tất cả các môn; quản trị không (PRD 5.1)."""
    if user.status != "active":
        return []
    if user.role in STAFF_ROLES:
        return list(db.scalars(select(Course.id).where(Course.status != "withdrawn")))
    if user.role == "student":
        ms = db.scalars(select(Membership).where(Membership.user_id == user.id, Membership.can_read.is_(True)))
        return [m.course_id for m in ms if active_membership(db, user, m.course_id)]
    return []


def assigned_course_ids(db: Session, user: User) -> list[str]:
    """Môn người dùng được phân công (hiển thị ở UI-02 và phạm vi quản lý)."""
    return [m.course_id for m in user.memberships if active_membership(db, user, m.course_id)]


def can_read_course(db: Session, user: User, course_id: str) -> bool:
    return course_id in readable_course_ids(db, user)


def can_upload(db: Session, user: User, course_id: str) -> bool:
    if user.status != "active" or user.role not in STAFF_ROLES:
        return False
    m = active_membership(db, user, course_id)
    return bool(m and m.can_upload)


def can_review(db: Session, user: User, course_id: str) -> bool:
    if user.status != "active" or user.role != "reviewer":
        return False
    m = active_membership(db, user, course_id)
    return bool(m and m.can_review)


def can_manage_course(db: Session, user: User, course_id: str) -> bool:
    """Dashboard/metric môn: chỉ môn phụ trách (upload hoặc duyệt), không phải mọi môn (AC-12.1)."""
    return can_upload(db, user, course_id) or can_review(db, user, course_id)


def managed_course_ids(db: Session, user: User) -> list[str]:
    return [cid for cid in assigned_course_ids(db, user) if can_manage_course(db, user, cid)]


def role_can_see_version(user: User, version: DocumentVersion) -> bool:
    if user.role not in version.acl_roles:
        return False
    return not (user.role == "student" and version.integrity_label in RESTRICTED_FOR_STUDENTS)


def can_serve_version(db: Session, user: User, version: DocumentVersion, document: Document) -> bool:
    """Nguồn được phục vụ cho Hub/RAG/citation: Published, không bị khóa, đúng môn và đúng ACL (BR-01, BR-03)."""
    return (
        version.state == PUBLISHED
        and not document.emergency_locked
        and document.current_version_id == version.id
        and can_read_course(db, user, document.course_id)
        and role_can_see_version(user, version)
    )


def can_download_version(db: Session, user: User, version: DocumentVersion, document: Document) -> bool:
    """Quyền tải riêng với quyền đọc (PRD 5.1, AC-01.3)."""
    if not can_serve_version(db, user, version, document):
        return False
    if user.role in STAFF_ROLES:
        return True
    m = active_membership(db, user, document.course_id)
    return bool(version.download_allowed and m and m.can_download)
