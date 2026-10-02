"""API trang Learning & Quiz: đề trắc nghiệm của giảng viên (D-38) + danh sách lộ trình / bài tự kiểm tra của SV (FR-03)."""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.deps import current_user
from src.config import get_settings
from src.db import get_db
from src.models.orm import Chunk, Conversation, Course, Message, StudyPlan, User
from src.services import course_quiz as svc
from src.services import page_render
from src.services.errors import AppError
from src.services.retrieval import servable_versions

router = APIRouter()


class QuizQuestionIn(BaseModel):
    id: str | None = None
    text: str = ""
    options: list[str] = Field(default_factory=list)
    correct: int | None = None
    explanation: str = ""


class QuizIn(BaseModel):
    course_id: str | None = None  # chỉ dùng khi tạo
    title: str
    kind: str = "practice"
    time_limit_s: int | None = None
    questions: list[QuizQuestionIn] = Field(default_factory=list)


class QuizStatus(BaseModel):
    status: str


class AttemptAnswers(BaseModel):
    answers: dict[str, int] = Field(default_factory=dict)


@router.get("/course-quizzes")
def list_quizzes(course_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"items": svc.list_quizzes(db, user, course_id)}


@router.post("/course-quizzes", status_code=201)
def create_quiz(body: QuizIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.view(svc.create(db, user, body.course_id or "", body.model_dump()), staff=True)


@router.get("/course-quizzes/{quiz_id}")
def get_quiz(quiz_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Người phụ trách: đủ đáp án. Người khác: dùng /attempts để làm bài (không bao giờ lộ đáp án ở đây)."""
    return svc.view(svc.get_manageable(db, user, quiz_id), staff=True)


@router.put("/course-quizzes/{quiz_id}")
def update_quiz(
    quiz_id: str, body: QuizIn, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.view(svc.update(db, user, quiz_id, body.model_dump()), staff=True)


@router.post("/course-quizzes/{quiz_id}/generate")
def generate_quiz(
    quiz_id: str,
    file: UploadFile = File(...),
    count: int = Form(10),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Giảng viên tải PDF (đề có sẵn hoặc tài liệu) → LLM tạo câu hỏi A–D vào đề Nháp. Hàm sync: chạy trong threadpool,
    gọi LLM không chặn event loop."""
    limit = get_settings().upload_max_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise AppError("FILE_TOO_LARGE", 413)
    quiz, added = svc.generate_from_pdf(db, user, quiz_id, data, count)
    return svc.view(quiz, staff=True) | {"added": added}


@router.post("/course-quizzes/{quiz_id}/status")
def quiz_status(
    quiz_id: str, body: QuizStatus, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.view(svc.set_status(db, user, quiz_id, body.status), staff=True)


@router.delete("/course-quizzes/{quiz_id}", status_code=204)
def delete_quiz(quiz_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> None:
    svc.delete(db, user, quiz_id)


@router.get("/course-quizzes/{quiz_id}/results")
def quiz_results(quiz_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.results(db, user, quiz_id)


@router.post("/course-quizzes/{quiz_id}/attempts")
def start_attempt(quiz_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.start(db, user, quiz_id)


@router.post("/quiz-attempts/{attempt_id}/submit")
def submit_attempt(
    attempt_id: str, body: AttemptAnswers, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.submit(db, user, attempt_id, body.answers)


# ---------------------------------------------------------------- Trung tâm học của SV (chỉ dữ liệu của chính mình)


@router.get("/learning/plans")
def my_plans(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.scalars(
        select(StudyPlan)
        .where(StudyPlan.owner_id == user.id, StudyPlan.status != "Superseded")
        .order_by(StudyPlan.updated_at.desc())
    )
    items = []
    for p in rows:
        sessions = p.data.get("sessions", [])
        items.append(
            {
                "id": p.id, "goal": p.goal, "status": p.status, "version": p.version, "course_id": p.course_id,
                "days": p.days, "minutes_per_day": p.minutes_per_day, "conversation_id": p.conversation_id,
                "done": sum(1 for s in sessions if s.get("status") == "done"), "total": len(sessions),
                "updated_at": svc._iso(p.updated_at),
            }
        )  # fmt: skip
    return {"items": items}


@router.get("/learning/self-checks")
def my_self_checks(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Bài tự kiểm tra / chẩn đoán do Learning Assistant tạo trong các hội thoại CÒN HIỆN của chính user."""
    rows = db.execute(
        select(Message, Conversation)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.owner_id == user.id, Conversation.deleted_at.is_(None), Message.role == "assistant")
        .order_by(Message.created_at.desc())
        .limit(500)
    ).all()
    items = []
    for m, c in rows:
        p = m.payload or {}
        if p.get("kind") not in ("quiz", "diagnose") or not p.get("questions"):
            continue
        topics = (p.get("assessment") or {}).get("topics") or []
        items.append(
            {
                "message_id": m.id, "conversation_id": c.id, "conversation_title": c.title, "kind": p["kind"],
                "topic": p.get("topic") or (p["questions"][0].get("topic") if p["questions"] else None),
                "questions": len(p["questions"]), "answered": len([v for v in (p.get("answers") or {}).values() if str(v).strip()]),
                "assessed": bool(topics), "levels": [t.get("level") for t in topics], "created_at": svc._iso(m.created_at),
            }
        )  # fmt: skip
    return {"items": items}


# Tiêu đề mục trong tài liệu (vd. "5.3 Hamilton Cycles and Paths") làm danh sách chủ đề để chọn khi ôn tập
_HEADING = re.compile(r"^\s*(\d{1,2}(?:\.\d{1,2}){1,2})\s+([A-Z][A-Za-z0-9 ,'’:\-()&/]{3,80}?)\s*(?:\d{1,4})?\s*$")


# Chữ hoa bị tách khỏi phần còn lại do font PDF ("W alks", "P olya") — chỉ sửa khi hiển thị tiêu đề
_SPLIT_CAP = re.compile(r"\b([B-HJ-Z]) ([a-z]{2,})")  # trừ "A", "I" (là từ thật: "A proof", "I think")


@router.get("/learning/topics")
def course_topics(course_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Chủ đề ôn tập = CHƯƠNG của các tài liệu đang phục vụ mà user được đọc (lọc quyền trước, BR-03; D-44).

    Lấy từ mục lục PDF (chương + các mục con); tài liệu không có mục lục → gom tiêu đề mục trong text theo số chương.
    Không gọi LLM.
    """
    items: list[dict[str, Any]] = []
    for version, document in servable_versions(db, user, course_id):  # rỗng nếu không có quyền môn
        toc: tuple[dict[str, Any], ...] = ()
        if version.file_type == "pdf":
            try:
                toc = page_render.chapters(version.storage_key)
            except Exception:  # noqa: BLE001 — mục lục hỏng → dùng tiêu đề trong text
                toc = ()
        if document.doc_type == "slide":  # bộ slide = MỘT bài; mục lục slide là từng trang "Slide N: …" → làm mục con
            course = db.get(Course, document.course_id)
            items.append(_slide_lesson(db, version.id, document.title, course.name if course else "", toc))
            continue
        chapters = [dict(c) for c in toc] or _chapters_from_text(db, version.id)
        items += [{**c, "document": document.title} for c in chapters]
    items.sort(key=lambda t: (t["document"], int(t["chapter"]) if t["chapter"].isdigit() else 999))
    return {"items": items}


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
