"""API lộ trình học theo tiến độ (D-82, FR-03.2–03.12): chương trình học, tiến độ, đánh giá, mức nắm vững, lộ trình.

Người dùng lấy từ token (BR-02); dữ liệu học tập chỉ của chính người học. Quản trị không có quyền nội dung học tập
(D-61) — `can_read_course` trả False nên mọi endpoint trả 404/rỗng.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.deps import require_role
from src.db import get_db
from src.models.orm import User
from src.services.learning_path import service as svc

router = APIRouter()
learner = require_role("student", "lecturer", "reviewer")


class ProgressIn(BaseModel):
    course_id: str
    current_lesson_id: str | None = Field(default=None, max_length=200)
    covered_lesson_ids: list[str] | None = Field(default=None, max_length=500)


class AssessmentIn(BaseModel):
    course_id: str
    topic_ids: list[str] | None = Field(default=None, max_length=200)  # ôn có trọng tâm (vẫn trong phạm vi đã học)
    path_id: str | None = None  # checkpoint của lộ trình
    step_id: str | None = None


class AnswersIn(BaseModel):
    answers: dict[str, int] = Field(default_factory=dict)


class PathIn(BaseModel):
    strategy: str


class StepIn(BaseModel):
    status: str


@router.get("/learning/curriculum")
def curriculum(course_id: str, user: User = Depends(learner), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.curriculum_view(db, user, course_id)


@router.get("/learning/progress")
def get_progress(course_id: str, user: User = Depends(learner), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.get_progress(db, user, course_id)


@router.put("/learning/progress")
def set_progress(body: ProgressIn, user: User = Depends(learner), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.set_progress(db, user, body.course_id, body.current_lesson_id, body.covered_lesson_ids)


@router.get("/learning/mastery")
def mastery(course_id: str, user: User = Depends(learner), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.mastery_view(db, user, course_id)


@router.post("/learning/assessments", status_code=201)
def create_assessment(
    body: AssessmentIn, user: User = Depends(learner), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Hàm sync: gọi LLM trong threadpool, không chặn event loop."""
    return svc.create_assessment(db, user, body.course_id, body.topic_ids, body.path_id, body.step_id)


@router.get("/learning/assessments")
def list_assessments(course_id: str, user: User = Depends(learner), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"items": svc.list_assessments(db, user, course_id)}


@router.get("/learning/assessments/{assessment_id}")
def get_assessment(assessment_id: str, user: User = Depends(learner), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.get_assessment(db, user, assessment_id)


@router.put("/learning/assessments/{assessment_id}/answers")
def save_answers(
    assessment_id: str, body: AnswersIn, user: User = Depends(learner), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.save_answers(db, user, assessment_id, body.answers)


@router.post("/learning/assessments/{assessment_id}/submit")
def submit_assessment(
    assessment_id: str, body: AnswersIn, user: User = Depends(learner), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.submit_assessment(db, user, assessment_id, body.answers)


@router.post("/learning/assessments/{assessment_id}/path", status_code=201)
def choose_path(
    assessment_id: str, body: PathIn, user: User = Depends(learner), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.choose_path(db, user, assessment_id, body.strategy)


@router.get("/learning/paths")
def list_paths(course_id: str, user: User = Depends(learner), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"items": svc.list_paths(db, user, course_id)}


@router.get("/learning/paths/{path_id}")
def get_path(path_id: str, user: User = Depends(learner), db: Session = Depends(get_db)) -> dict[str, Any]:
    return svc.get_path(db, user, path_id)


@router.post("/learning/paths/{path_id}/steps/{step_id}")
def update_step(
    path_id: str, step_id: str, body: StepIn, user: User = Depends(learner), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return svc.update_step(db, user, path_id, step_id, body.status)
