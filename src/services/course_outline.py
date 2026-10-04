"""Mục lục môn học từ tài liệu đang phục vụ (D-44, D-47): chương của sách / mỗi bộ slide là một bài.

Dùng chung cho `GET /learning/topics` (chọn chủ đề ôn tập) và chương trình học suy ra (`learning_path.curriculum`).
Lọc quyền trước (BR-03): chỉ đọc tài liệu Published hiện hành mà user được đọc. Không gọi LLM.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.orm import Chunk, Course, User
from src.services import page_render
from src.services.retrieval import servable_versions

# Tiêu đề mục trong tài liệu (vd. "5.3 Hamilton Cycles and Paths") làm danh sách chủ đề để chọn khi ôn tập
_HEADING = re.compile(r"^\s*(\d{1,2}(?:\.\d{1,2}){1,2})\s+([A-Z][A-Za-z0-9 ,'’:\-()&/]{3,80}?)\s*(?:\d{1,4})?\s*$")

# Chữ hoa bị tách khỏi phần còn lại do font PDF ("W alks", "P olya") — chỉ sửa khi hiển thị tiêu đề
_SPLIT_CAP = re.compile(r"\b([B-HJ-Z]) ([a-z]{2,})")  # trừ "A", "I" (là từ thật: "A proof", "I think")


def course_chapters(db: Session, user: User, course_id: str) -> list[dict[str, Any]]:
    """Chủ đề ôn tập = CHƯƠNG của các tài liệu đang phục vụ mà user được đọc (rỗng nếu không có quyền môn).

    Lấy từ mục lục PDF (chương + các mục con); tài liệu không có mục lục → gom tiêu đề mục trong text theo số chương.
    Mỗi mục có `document_id` để truy xuất đúng tài liệu của bài.
    """
    items: list[dict[str, Any]] = []
    for version, document in servable_versions(db, user, course_id):
        toc: tuple[dict[str, Any], ...] = ()
        if version.file_type == "pdf":
            try:
                toc = page_render.chapters(version.storage_key)
            except Exception:  # noqa: BLE001 — mục lục hỏng → dùng tiêu đề trong text
                toc = ()
        if document.doc_type == "slide":  # bộ slide = MỘT bài; mục lục slide là từng trang "Slide N: …" → làm mục con
            course = db.get(Course, document.course_id)
            lesson = _slide_lesson(db, version.id, document.title, course.name if course else "", toc)
            items.append({**lesson, "document_id": document.id})
            continue
        chapters = [dict(c) for c in toc] or _chapters_from_text(db, version.id)
        items += [{**c, "document": document.title, "document_id": document.id} for c in chapters]
    items.sort(key=lambda t: (t["document"], int(t["chapter"]) if t["chapter"].isdigit() else 999))
    return items


_LESSON_NO = re.compile(r"^(\d{1,2})\s*[-_.\s]\s*(.+)$")
_SLIDE_TITLE = re.compile(r"^Slide\s+\d+\s*:\s*", re.I)
_GENERIC_SLIDE = {"nội dung", "tổng kết", "mục tiêu", "câu hỏi", "thảo luận", "tài liệu tham khảo", "bài tập"}


def _slide_lesson(
    db: Session, version_id: str, title: str, course_name: str, toc: tuple[dict[str, Any], ...]
) -> dict[str, Any]:
    """Một bộ slide → một bài ôn tập (D-47). Tên bài = tiêu đề trang bìa (chunk đầu, bỏ dòng tên môn / "Chapter N");
    mục con = gạch đầu dòng của slide "Nội dung", không có thì lấy tiêu đề slide trong mục lục. Số bài theo tên file."""
    m = _LESSON_NO.match(title)
    first = db.scalar(select(Chunk.text).where(Chunk.version_id == version_id).order_by(Chunk.ordinal).limit(1)) or ""
    lines = [ln.strip().lstrip("◼").strip() for ln in first.splitlines() if ln.strip()]
    name = next(
        (ln for ln in lines[:4] if ln.lower() != course_name.lower() and not re.match(r"(?i)^chapter \d+$", ln)), None
    )
    sections: list[str] = []
    if "Nội dung" in lines:
        for ln in lines[lines.index("Nội dung") + 1 :]:
            if not ln.startswith(("•", "-", "§")):
                break
            sections.append(ln.lstrip("•-§ ").strip())
    if not sections:
        for c in toc:
            t = _SLIDE_TITLE.sub("", c["title"]).strip()
            if (
                t
                and t.lower() not in _GENERIC_SLIDE
                and t not in sections
                and t.lower() != course_name.lower()
                and not t.lower().startswith("chapter ")
            ):
                sections.append(t)
    lesson = re.sub(r"(?i)^bài\s*\d+\s*:\s*", "", name) if name else (m.group(2).strip() if m else title)
    return {
        "chapter": str(int(m.group(1))) if m else "0", "title": lesson,
        "page": 1, "sections": sections[:20], "document": "Bài giảng (slide)", "kind": "lesson",
    }  # fmt: skip


def _chapters_from_text(db: Session, version_id: str) -> list[dict[str, Any]]:
    """Dự phòng: tiêu đề mục "5.3 Hamilton Cycles…" trong chunk → gom theo chương 5 (tên chương chưa biết)."""
    found: dict[str, dict[str, Any]] = {}
    rows = db.execute(
        select(Chunk.locator_value, Chunk.text)
        .where(Chunk.version_id == version_id)
        .order_by(Chunk.locator_value, Chunk.ordinal)
    ).all()
    for page, text in rows:
        for line in text.splitlines():
            m = _HEADING.match(line)
            if not m or "/x" in line:  # "/x" = ký tự lỗi font còn sót — bỏ, không đoán
                continue
            chapter = m.group(1).split(".")[0]
            title = _SPLIT_CAP.sub(r"\1\2", m.group(2).strip())
            ch = found.setdefault(
                chapter, {"chapter": chapter, "title": f"Chương {chapter}", "page": page, "sections": []}
            )
            if title not in ch["sections"] and not re.match(r"(?i)^(exercises?|examples?)$", title):
                ch["sections"].append(title)
    return [c for c in found.values() if c["sections"]]
