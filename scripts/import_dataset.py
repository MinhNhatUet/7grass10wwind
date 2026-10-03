#!/usr/bin/env python3
"""Import teaching files from src/data into the backend document tables.

This is a local/dev loader for making the existing data folder visible in the
app library. It creates courses from config/courses.yaml, creates dev users when
needed, gives student/lecturer/reviewer access, extracts text, creates chunks,
and publishes readable documents.
"""

from __future__ import annotations

import argparse
import sys
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db import REPO_ROOT, get_engine, init_db
from src.ingestion.course_registry import CourseRegistry, CourseRegistryError
from src.models.orm import PUBLISHED, Chunk, Course, Document, DocumentVersion, Membership, User
from src.services import ingestion, storage
from src.services.auth import hash_password

DEFAULT_USERS = (
    ("u_student", "student@example.com", "Student Dev", "student", "Student123!"),
    ("u_lecturer", "lecturer@example.com", "Lecturer Dev", "lecturer", "Lecturer123!"),
    ("u_reviewer", "reviewer@example.com", "Reviewer Dev", "reviewer", "Reviewer123!"),
)

SUPPORTED_SUFFIXES = {".pdf", ".pptx"}


def _course_folder_from_path(path: Path, data_root: Path) -> str | None:
    try:
        rel = path.relative_to(data_root)
    except ValueError:
        return None
    return rel.parts[0] if rel.parts else None


def _doc_type(path: Path) -> str:
    name = path.name.casefold()
    if "exercise" in name or "bai tap" in name or "bài tập" in name:
        return "exercise"
    if path.suffix.lower() == ".pptx" or "slide" in name:
        return "slide"
    return "textbook"


def _chapter(path: Path) -> str | None:
    stem = path.stem.replace("_", " ").replace("-", " ")
    return " ".join(stem.split())[:200] or None


def _upsert_courses(db: Session, registry: CourseRegistry) -> list[str]:
    course_ids: list[str] = []
    for info in registry.courses.values():
        course = db.get(Course, info.id) or Course(id=info.id)
        course.code = info.code
        course.name = info.name
        course.term = info.term
        course.status = info.status
        db.merge(course)
        course_ids.append(info.id)
    return course_ids


def _upsert_users_and_memberships(db: Session, course_ids: list[str]) -> None:
    permissions = {
        "student": dict(can_read=True, can_download=False, can_upload=False, can_review=False),
        "lecturer": dict(can_read=True, can_download=True, can_upload=True, can_review=False),
        "reviewer": dict(can_read=True, can_download=True, can_upload=True, can_review=True),
    }
    valid_to = datetime.now(UTC) + timedelta(days=365)
    for user_id, login, display_name, role, password in DEFAULT_USERS:
        user = db.scalar(select(User).where(User.login_id == login)) or db.get(User, user_id)
        if user is None:
            user = User(id=user_id, login_id=login)
            db.add(user)
        user.display_name = display_name
        user.role = role
        user.status = "active"
        user.password_hash = hash_password(password)
        db.flush()
        for course_id in course_ids:
            membership = db.scalar(
                select(Membership).where(Membership.user_id == user.id, Membership.course_id == course_id)
            )
            if membership is None:
                membership = Membership(user_id=user.id, course_id=course_id)
                db.add(membership)
            for key, value in permissions[role].items():
                setattr(membership, key, value)
            membership.valid_to = valid_to


def _maybe_extract_zip(zip_path: Path, data_root: Path) -> None:
    if data_root.exists() and any(data_root.iterdir()):
        return
    if not zip_path.is_file():
        return
    data_root.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            target = (data_root.parent / member.filename).resolve()
            if data_root.parent.resolve() not in target.parents and target != data_root.parent.resolve():
                raise RuntimeError(f"Unsafe zip path: {member.filename}")
        archive.extractall(data_root.parent)


def _iter_files(data_root: Path) -> list[Path]:
    return sorted(
        path
        for path in data_root.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES and not path.name.startswith("~$")
    )


def _import_file(db: Session, path: Path, data_root: Path, registry: CourseRegistry, uploader_id: str) -> str:
    folder = _course_folder_from_path(path, data_root)
    if folder is None:
        return "skipped:no_course_folder"
    try:
        course = registry.resolve_folder(folder)
    except CourseRegistryError:
        return "skipped:unknown_course"

    content = path.read_bytes()
    checksum, storage_key = storage.save_bytes(content)
    duplicate = db.scalar(
        select(DocumentVersion)
        .join(Document)
        .where(Document.course_id == course.id, DocumentVersion.checksum == checksum)
        .where(DocumentVersion.state == PUBLISHED)
    )
    if duplicate is not None:
        return "skipped:duplicate"

    try:
        extracted = ingestion.extract(content)
    except ingestion.IngestionError as exc:
        return f"failed:{exc.code}"

    document = Document(
        course_id=course.id,
        owner_id=uploader_id,
        title=path.stem,
        doc_type=_doc_type(path),
    )
    db.add(document)
    db.flush()

    version = DocumentVersion(
        document_id=document.id,
        version_label="1",
        state=PUBLISHED,
        file_type=extracted.file_type,
        original_filename=path.name[:500],
        checksum=checksum,
        storage_key=storage_key,
        size_bytes=len(content),
        page_count=extracted.page_count,
        authors=None,
        provenance=f"Local import from {path.relative_to(data_root).as_posix()}",
        usage_permission="confirmed",
        acl_roles=["student", "lecturer", "reviewer"],
        download_allowed=False,
        integrity_label="learning_material",
        chapter=_chapter(path),
        uploader_id=uploader_id,
        quality_warnings=extracted.warnings,
        published_at=datetime.now(UTC),
    )
    db.add(version)
    db.flush()
    document.current_version_id = version.id
    for index, chunk in enumerate(extracted.chunks):
        db.add(
            Chunk(
                version_id=version.id,
                ordinal=index,
                locator_type=chunk.locator_type,
                locator_value=chunk.locator_value,
                text=chunk.text,
                extraction_quality=chunk.quality,
            )
        )
    return f"imported:{len(extracted.chunks)}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import src/data into the backend library.")
    parser.add_argument("--data-root", default="src/data")
    parser.add_argument("--courses", default="config/courses.yaml")
    parser.add_argument("--zip", default="src/data.zip", help="Only used when --data-root is empty or missing")
    parser.add_argument("--limit", type=int, default=0, help="Import at most this many files; 0 means all")
    args = parser.parse_args(argv)

    data_root = (REPO_ROOT / args.data_root).resolve()
    _maybe_extract_zip((REPO_ROOT / args.zip).resolve(), data_root)
    if not data_root.is_dir():
        print(f"Data folder not found: {data_root}", file=sys.stderr)
        return 2

    registry = CourseRegistry.load(REPO_ROOT / args.courses)
    files = _iter_files(data_root)
    if args.limit:
        files = files[: args.limit]
    if not files:
        print(f"No supported PDF/PPTX files found in {data_root}")
        return 1

    init_db()
    counts: dict[str, int] = {}
    with Session(get_engine()) as db:
        course_ids = _upsert_courses(db, registry)
        _upsert_users_and_memberships(db, course_ids)
        db.commit()

        for path in files:
            status = _import_file(db, path, data_root, registry, "u_lecturer")
            counts[status.split(":", 1)[0]] = counts.get(status.split(":", 1)[0], 0) + 1
            print(f"{path.relative_to(data_root).as_posix()}: {status}")
            db.commit()

    print("Done:", ", ".join(f"{key}={value}" for key, value in sorted(counts.items())))
    print("Login: student@example.com / Student123!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
