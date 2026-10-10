"""API trang Learning & Quiz: đề trắc nghiệm của giảng viên (D-38) + danh sách lộ trình / bài tự kiểm tra của SV (FR-03)."""

from __future__ import annotations

import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.deps import current_user, require_role
from src.config import get_settings
from src.db import get_db
from src.models.orm import Conversation, Message, StudyPlan, User
from src.services import acl
from src.services import conversations as plan_svc
from src.services import course_quiz as svc
from src.services.assistants.study_tools import lessons_label
from src.services.course_outline import course_chapters
from src.services.errors import AppError
from src.services.formatting import iso
from src.services.learning_path.curriculum import load_curriculum

router = APIRouter()


class QuizQuestionIn(BaseModel):
    id: str | None = None
    text: str = ""
    options: list[str] = Field(default_factory=list)
    correct: int | None = None
    explanation: str = ""
    lesson_id: str | None = None  # gắn chương trình học (tùy chọn) — xem learning_path.curriculum
    topic_id: str | None = None
    objective_id: str | None = None


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
    mode: Literal["exam", "material"] = Form("material"),  # exam: chép đề có sẵn; material: AI soạn từ tài liệu
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Giảng viên tải PDF (đề có sẵn hoặc tài liệu) → LLM tạo câu hỏi A–D vào đề Nháp. Hàm sync: chạy trong threadpool,
    gọi LLM không chặn event loop."""
    limit = get_settings().upload_max_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise AppError("FILE_TOO_LARGE", 413)
    quiz, added = svc.generate_from_pdf(db, user, quiz_id, data, count, mode)
    return svc.view(quiz, staff=True) | {"added": added}


@router.get("/course-quizzes/{quiz_id}/questions/{question_id}/source-image")
def quiz_source_image(
    quiz_id: str,
    question_id: str,
    width: int = 1000,
    page: int | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Ảnh trang PDF gốc của câu đã chép (GV đối chiếu khi duyệt đề). `page`: trang khác của cùng file (cuộn đề gốc).
    Chỉ người quản lý đề; không cache."""
    if page is not None and page < 1:
        raise AppError("PAGE_OUT_OF_RANGE", 404)
    image = svc.source_image(db, user, quiz_id, question_id, max(400, min(width, 1600)), page)
    return Response(image, media_type="image/png", headers={"Cache-Control": "private, no-store"})


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
def my_plans(user: User = Depends(require_role("student")), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Lộ trình chỉ dành cho sinh viên (PRD FR-03); GV/GV duyệt/quản trị → 403."""
    rows = db.scalars(
        select(StudyPlan)
        .where(StudyPlan.owner_id == user.id, StudyPlan.status != "Superseded")
        .order_by(StudyPlan.updated_at.desc())
    )
    items = []
    for p in rows:
        view = plan_svc.plan_view(db, user, p)
        sessions = view["sessions"]
        items.append(
            {
                "id": p.id, "goal": view["goal"], "status": p.status, "version": p.version, "course_id": p.course_id,
                "masked": view["masked"],
                "days": p.days, "minutes_per_day": p.minutes_per_day, "conversation_id": p.conversation_id,
                "done": sum(1 for s in sessions if s.get("status") == "done"), "total": len(sessions),
                "updated_at": iso(p.updated_at),
            }
        )  # fmt: skip
    return {"items": items}


SELF_CHECK_KINDS = plan_svc.SELF_CHECK_KINDS
_LESSON_REF = re.compile(r'\b(Bài|Chương)\s+(\d+)\s+"')


def _short_topic(p: dict[str, Any]) -> str | None:
    """Nhãn ngắn đã lưu lúc tạo; bản cũ (topic = mô tả đầy đủ nhiều bài) → "Bài 1, 2, 3"; còn lại cắt ~80 ký tự."""
    if p.get("label"):
        return str(p["label"])
    topic = str(p.get("topic") or "").strip()
    refs = _LESSON_REF.findall(topic)
    if len(refs) > 1:
        return lessons_label(refs)
    return (topic if len(topic) <= 80 else topic[:77].rsplit(" ", 1)[0] + "…") or None


@router.get("/learning/self-checks")
def my_self_checks(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Bài ôn tập (trắc nghiệm, flashcard, điền khuyết), tự kiểm tra, chẩn đoán do Learning Assistant tạo trong các hội
    thoại CÒN HIỆN của chính user — để mở lại. Chỉ tên/số câu; nội dung mở qua hội thoại (kiểm lại quyền nguồn, BR-10)."""
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
        entries = p.get("questions") or p.get("items")
        if p.get("kind") not in SELF_CHECK_KINDS or not entries or p.get("masked"):
            continue
        topics = (p.get("assessment") or {}).get("topics") or []
        items.append(
            {
                "message_id": m.id, "conversation_id": c.id, "conversation_title": c.title, "kind": p["kind"],
                "topic": _short_topic(p) or (entries[0].get("topic") if p.get("questions") else None),
                "questions": len(entries), "answered": len([v for v in (p.get("answers") or {}).values() if str(v).strip()]),
                "assessed": bool(topics), "levels": [t.get("level") for t in topics], "created_at": iso(m.created_at),
            }
        )  # fmt: skip
    return {"items": items}


@router.get("/learning/topics")
def course_topics(course_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Bài để ôn tập = các BÀI của chương trình học môn (cùng nguồn với trang Lộ trình, D-82): đánh số 1…N, mỗi bài
    gồm các chủ đề. Trước đây lấy mục lục từng file PDF → slide không có số chương thành "Bài 0", mỗi file một "bài"
    trùng tên. Chương trình học rỗng (môn chưa có tài liệu dựng được) → mục lục tài liệu như cũ. Lọc quyền như
    load_curriculum (BR-03); không gọi LLM ở lượt này (bản LLM dựng đã lưu sẵn)."""
    cur = load_curriculum(db, user, course_id) if acl.can_read_course(db, user, course_id) else None
    if not cur or not cur.lessons:
        return {"items": course_chapters(db, user, course_id)}
    return {
        "items": [
            {"chapter": str(lesson.order), "title": lesson.title, "document": "Chương trình học",
             "page": lesson.page, "sections": [t.title for t in lesson.topics], "kind": "lesson"}
            for lesson in cur.lessons
        ]
    }  # fmt: skip
