#!/usr/bin/env python3
"""Script tạo môn học mẫu để test. Chạy: python scripts/seed_courses.py"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.db import get_engine, init_db
from src.models.orm import Course, Membership, User
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime, timedelta, timezone

UTC = timezone.utc

COURSES = [
    {"id": "COURSE-01", "code": "MATH101", "name": "Toán rời rạc 1", "term": "2024-1"},
    {"id": "COURSE-02", "code": "CS201",   "name": "Cấu trúc dữ liệu và giải thuật", "term": "2024-1"},
    {"id": "COURSE-03", "code": "AI301",   "name": "Trí tuệ nhân tạo", "term": "2024-1"},
]

def main():
    print("Khởi tạo DB...")
    init_db()

    engine = get_engine()
    with Session(engine) as db:
        # Tạo các môn học
        created = 0
        for c in COURSES:
            existing = db.get(Course, c["id"])
            if existing:
                print(f"  ⚠️  Course {c['id']} đã tồn tại, bỏ qua.")
                continue
            course = Course(
                id=c["id"],
                code=c["code"],
                name=c["name"],
                term=c["term"],
                status="active",
            )
            db.add(course)
            created += 1
            print(f"  ✅ Tạo môn: {c['name']} ({c['id']})")
        db.commit()
        print(f"\nĐã tạo {created} môn học.")

        # Gán tất cả student vào tất cả môn (nếu chưa có)
        students = db.scalars(select(User).where(User.role == "student")).all()
        mem_created = 0
        for user in students:
            for c in COURSES:
                existing_mem = db.scalar(
                    select(Membership).where(
                        Membership.user_id == user.id,
                        Membership.course_id == c["id"]
                    )
                )
                if existing_mem:
                    continue
                mem = Membership(
                    user_id=user.id,
                    course_id=c["id"],
                    can_read=True,
                    can_download=True,
                    valid_to=datetime.now(UTC) + timedelta(days=365)
                )
                db.add(mem)
                mem_created += 1
        db.commit()
        print(f"Đã gán {mem_created} memberships cho {len(students)} student(s).")

        # Gán tất cả lecturer vào tất cả môn với quyền upload
        lecturers = db.scalars(select(User).where(User.role == "lecturer")).all()
        lec_mem_created = 0
        for user in lecturers:
            for c in COURSES:
                existing_mem = db.scalar(
                    select(Membership).where(
                        Membership.user_id == user.id,
                        Membership.course_id == c["id"]
                    )
                )
                if existing_mem:
                    continue
                mem = Membership(
                    user_id=user.id,
                    course_id=c["id"],
                    can_read=True,
                    can_download=True,
                    can_upload=True,
                    valid_to=datetime.now(UTC) + timedelta(days=365)
                )
                db.add(mem)
                lec_mem_created += 1
        db.commit()
        print(f"Đã gán {lec_mem_created} memberships (upload) cho {len(lecturers)} lecturer(s).")

    print("\n✅ Seed hoàn tất!")
    print("Các môn học có thể dùng:")
    for c in COURSES:
        print(f"  - {c['id']}: {c['name']}")

if __name__ == "__main__":
    main()
