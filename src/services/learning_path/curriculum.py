"""Chương trình học của một môn: bài → chủ đề → mục tiêu học tập (D-82).

Hai nguồn, dùng chung cho mọi môn (pipeline đánh giá → chẩn đoán → chọn lộ trình → lộ trình không phụ thuộc môn):

1. **Đề cương do giảng viên soạn** `config/curricula/<COURSE_ID>.yaml` (`source = "authored"`): thứ tự bài, mục tiêu,
   quan hệ tiên quyết giữa các chủ đề, tài liệu của từng bài. Có file này thì dùng nó.
2. **Suy ra từ tài liệu đang phục vụ** (`source = "derived"`): mỗi bộ slide / chương sách là một bài, mục con là chủ đề
   (cùng logic `GET /learning/topics`, D-44/D-47). Mục tiêu sinh theo mẫu và quan hệ tiên quyết chỉ là thứ tự bài —
   đánh dấu là đề xuất cần xác nhận (FR-03.6), không bịa thêm.

Lọc quyền trước (BR-03): bài suy ra chỉ từ tài liệu user được đọc; bài trong đề cương trỏ tới tài liệu user không còn
được đọc vẫn hiện (tên bài là của đề cương) nhưng `document_id = None` → không truy xuất được, không tạo câu hỏi.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session

from src.db import REPO_ROOT
from src.models.orm import User
from src.services.assistants import dedupe_key
from src.services.course_outline import course_chapters
from src.services.retrieval import servable_versions

CURRICULA_DIR = REPO_ROOT / "config" / "curricula"
MAX_DERIVED_TOPICS = 8  # bộ slide có thể có ~20 tiêu đề slide; giữ phần đầu (mục "Nội dung") cho bài đánh giá gọn
_ID = re.compile(r"^[A-Za-z0-9_.:\-]{1,120}$")


class CurriculumError(ValueError):
    """Đề cương YAML sai cấu trúc — báo rõ cho người soạn, không đoán."""


@dataclass(frozen=True)
class Objective:
    id: str
    text: str


@dataclass(frozen=True)
class Topic:
    id: str
    title: str
    lesson_id: str
    objectives: tuple[Objective, ...]
    prerequisites: tuple[str, ...] = ()
    query: str = ""  # truy vấn truy xuất nguồn cho chủ đề


@dataclass(frozen=True)
class Lesson:
    id: str
    order: int
    title: str
    topics: tuple[Topic, ...]
    document_id: str | None = None  # tài liệu chính của bài (giới hạn truy xuất), None = cả môn
    document_title: str | None = None
    page: int | None = None


@dataclass(frozen=True)
class Curriculum:
    course_id: str
    source: str  # authored | derived
    lessons: tuple[Lesson, ...]
    notes: tuple[str, ...] = field(default=())

    def lesson(self, lesson_id: str) -> Lesson | None:
        return next((x for x in self.lessons if x.id == lesson_id), None)

    def topic(self, topic_id: str) -> Topic | None:
        return next((t for x in self.lessons for t in x.topics if t.id == topic_id), None)

    def topics(self, lesson_ids: set[str] | None = None) -> list[Topic]:
        return [t for x in self.lessons if lesson_ids is None or x.id in lesson_ids for t in x.topics]

    def lesson_of(self, topic: Topic) -> Lesson:
        lesson = self.lesson(topic.lesson_id)
        assert lesson is not None
        return lesson

    def lessons_upto(self, lesson_id: str) -> list[str]:
        """Học tới bài N (theo thứ tự đề cương) → phạm vi đã học = bài 1..N."""
        target = self.lesson(lesson_id)
        return [x.id for x in self.lessons if target is not None and x.order <= target.order]

    def next_lessons(self, covered: set[str]) -> list[Lesson]:
        return [x for x in self.lessons if x.id not in covered]

    def to_dict(self) -> dict[str, Any]:
        return {
            "course_id": self.course_id,
            "source": self.source,
            "notes": list(self.notes),
            "lessons": [asdict(x) for x in self.lessons],
        }


# ---------------------------------------------------------------- đề cương do giảng viên soạn


def _check_id(value: Any, where: str) -> str:
    v = str(value or "").strip()
    if not _ID.match(v):
        raise CurriculumError(f"{where}: id không hợp lệ {value!r}")
    return v


def parse_authored(raw: dict[str, Any], course_id: str, documents: dict[str, tuple[str, str]]) -> Curriculum:
    """`documents`: tên hoặc id tài liệu → (document_id, title) của tài liệu user ĐƯỢC đọc trong môn."""
    if not isinstance(raw, dict) or not isinstance(raw.get("lessons"), list) or not raw["lessons"]:
        raise CurriculumError("đề cương cần danh sách 'lessons'")
    lessons: list[Lesson] = []
    seen: set[str] = set()
    notes: list[str] = []
    for order, ls in enumerate(raw["lessons"], start=1):
        if not isinstance(ls, dict):
            raise CurriculumError(f"bài thứ {order} phải là object")
        lid = _check_id(ls.get("id"), f"bài {order}")
        doc = documents.get(str(ls.get("document") or "").strip()) if ls.get("document") else None
        if ls.get("document") and doc is None:
            notes.append(f"Bài “{ls.get('title') or lid}”: tài liệu chưa phát hành hoặc bạn không có quyền đọc.")
        topics: list[Topic] = []
        for tn, tp in enumerate(ls.get("topics") or [], start=1):
            if not isinstance(tp, dict):
                raise CurriculumError(f"{lid}: chủ đề thứ {tn} phải là object")
            tid = _check_id(tp.get("id"), f"{lid} chủ đề {tn}")
            title = str(tp.get("title") or "").strip()[:300]
            if not title:
                raise CurriculumError(f"{tid}: thiếu title")
            objs = []
            for on, ob in enumerate(tp.get("objectives") or [], start=1):
                text = str(ob.get("text") if isinstance(ob, dict) else ob or "").strip()[:500]
                oid = _check_id(ob.get("id") if isinstance(ob, dict) and ob.get("id") else f"{tid}.O{on}", tid)
                if text:
                    objs.append(Objective(oid, text))
            if not objs:
                objs = [Objective(f"{tid}.O1", f"Hiểu và vận dụng được: {title}")]
            prereq = tuple(str(p) for p in tp.get("prerequisites") or [])
            unknown = [p for p in prereq if p not in seen]
            if unknown:  # chỉ chấp nhận tiên quyết đã xuất hiện TRƯỚC (đề cương có thứ tự, không vòng)
                raise CurriculumError(f"{tid}: tiên quyết chưa khai báo trước đó: {unknown}")
            for x in (tid, *(o.id for o in objs)):
                if x in seen:
                    raise CurriculumError(f"id trùng: {x}")
                seen.add(x)
            topics.append(Topic(tid, title, lid, tuple(objs), prereq, str(tp.get("query") or title)[:500]))
        if not topics:
            raise CurriculumError(f"{lid}: bài cần ít nhất một chủ đề")
        if lid in seen:
            raise CurriculumError(f"id trùng: {lid}")
        seen.add(lid)
        lessons.append(
            Lesson(
                lid,
                order,
                str(ls.get("title") or lid)[:300],
                tuple(topics),
                doc[0] if doc else None,
                doc[1] if doc else None,
                ls.get("page"),
            )  # fmt: skip
        )
    return Curriculum(course_id, "authored", tuple(lessons), tuple(notes))


def _authored_file(course_id: str) -> Path | None:
    if not _ID.match(course_id):
        return None
    path = CURRICULA_DIR / f"{course_id}.yaml"
    return path if path.is_file() else None


# ---------------------------------------------------------------- suy ra từ tài liệu


def _slug(text: str) -> str:
    key = dedupe_key(text)
    return hashlib.sha1(key.encode()).hexdigest()[:8]


def derive(course_id: str, chapters: list[dict[str, Any]]) -> Curriculum:
    """Bài = mỗi bộ slide/chương (slide trước — bài giảng là tiến độ lớp học; rồi chương sách theo tên + số chương).
    Chủ đề = mục con; bài không có mục con → một chủ đề trùng tên bài. ID ổn định theo tài liệu + tên mục."""

    def key(c: dict[str, Any]) -> tuple[int, str, int]:
        return (0 if c.get("kind") == "lesson" else 1, str(c.get("document")),
                int(c["chapter"]) if str(c.get("chapter", "")).isdigit() else 999)  # fmt: skip

    lessons: list[Lesson] = []
    for order, c in enumerate(sorted(chapters, key=key), start=1):
        lid = f"{c['document_id']}:{c['chapter']}"
        title = str(c.get("title") or f"Chương {c['chapter']}")[:300]
        sections = [s for s in dict.fromkeys(str(s).strip() for s in c.get("sections") or []) if s]
        sections = sections[:MAX_DERIVED_TOPICS] or [title]
        topics = []
        for s in sections:
            tid = f"{lid}:{_slug(s)}"
            topics.append(
                Topic(
                    tid,
                    s[:300],
                    lid,
                    (Objective(f"{tid}:o1", f"Trình bày và vận dụng được: {s[:280]}"),),
                    (),
                    f"{title}: {s}"[:500],
                )  # fmt: skip
            )
        doc_title = None if c.get("kind") == "lesson" else c.get("document")
        lessons.append(Lesson(lid, order, title, tuple(topics), c["document_id"], doc_title or title, c.get("page")))
    notes = (
        "Chương trình suy ra từ mục lục tài liệu: mục tiêu sinh theo mẫu, thứ tự bài là đề xuất — giảng viên có thể "
        "soạn đề cương config/curricula/<mã môn>.yaml để chốt mục tiêu và quan hệ tiên quyết.",
    )
    return Curriculum(course_id, "derived", tuple(lessons), notes if lessons else ())


def load_curriculum(db: Session, user: User, course_id: str) -> Curriculum:
    """Chương trình học user được thấy (rỗng nếu không có quyền môn — gọi sau khi đã kiểm can_read_course)."""
    path = _authored_file(course_id)
    if path is not None:
        try:
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as e:
            raise CurriculumError(f"YAML lỗi: {e}") from e
        docs: dict[str, tuple[str, str]] = {}
        for _v, d in servable_versions(db, user, course_id):
            docs[d.id] = docs[d.title] = (d.id, d.title)
        return parse_authored(raw, course_id, docs)
    return derive(course_id, course_chapters(db, user, course_id))
