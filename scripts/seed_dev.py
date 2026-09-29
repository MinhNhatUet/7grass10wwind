#!/usr/bin/env python3
"""Seed dữ liệu dev tối thiểu: users + courses + memberships.

Chạy từ gốc repo:
    python scripts/seed_dev.py

Tài khoản tạo sẵn:
    student@example.com / Student123!
    lecturer@example.com / Lecturer123!
    reviewer@example.com / Reviewer123!
    admin@example.com / Admin123!
"""
from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db import get_engine, init_db
from src.models.orm import Course, Membership, User
from src.services.auth import hash_password

COURSES = [
    {"id": "COURSE-01", "code": "MATH101", "name": "Toán rời rạc 1", "term": "2024-1"},
    {"id": "COURSE-02", "code": "CS201", "name": "Cấu trúc dữ liệu và giải thuật", "term": "2024-1"},
    {"id": "COURSE-03", "code": "AI301", "name": "Trí tuệ nhân tạo", "term": "2024-1"},
]

USERS = [
    ("u_student", "student@example.com", "Student Dev", "student", "Student123!"),
    ("u_lecturer", "lecturer@example.com", "Lecturer Dev", "lecturer", "Lecturer123!"),
    ("u_reviewer", "reviewer@example.com", "Reviewer Dev", "reviewer", "Reviewer123!"),
    ("u_admin", "admin@example.com", "Admin Dev", "admin", "Admin123!"),
]

PERMS = {
    "student": dict(can_read=True, can_download=False, can_upload=False, can_review=False),
    "lecturer": dict(can_read=True, can_download=True, can_upload=True, can_review=False),
    "reviewer": dict(can_read=True, can_download=True, can_upload=True, can_review=True),
}


def upsert_membership(db: Session, user_id: str, course_id: str, role: str) -> None:
    if role not in PERMS:
        return
    m = db.scalar(select(Membership).where(Membership.user_id == user_id, Membership.course_id == course_id))
    if m is None:
        m = Membership(user_id=user_id, course_id=course_id)
        db.add(m)
    for k, v in PERMS[role].items():
        setattr(m, k, v)
    m.valid_to = datetime.now(UTC) + timedelta(days=365)


def main() -> int:
    init_db()
    with Session(get_engine()) as db:
        for c in COURSES:
            course = db.get(Course, c["id"]) or Course(id=c["id"])
            course.code = c["code"]
            course.name = c["name"]
            course.term = c["term"]
            course.status = "active"
            db.merge(course)

        for uid, login, name, role, password in USERS:
            user = db.scalar(select(User).where(User.login_id == login)) or db.get(User, uid)
            if user is None:
                user = User(id=uid, login_id=login)
                db.add(user)
            user.display_name = name
            user.role = role
            user.status = "active"
            user.password_hash = hash_password(password)
            if role != "admin":
                for c in COURSES:
                    upsert_membership(db, user.id, c["id"], role)

        db.commit()

    print("OK: Da seed dev users/courses/memberships")
    print("Accounts:")
    for _, login, _, role, password in USERS:
        print(f"  - {role}: {login} / {password}")
    print("\nTiep theo import tai lieu, vi du:")
    print("  python scripts/import_books.py --course COURSE-01 --limit 1 --confirm-dev-usage --wait")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
