"""Đề trắc nghiệm do giảng viên soạn (D-38 — mở rộng ngoài PRD 7.2).

Quyền (server quyết định, không tin client — BR-02):
- Soạn/sửa/phát hành/đóng/xem kết quả: người PHỤ TRÁCH môn (upload hoặc duyệt — acl.can_manage_course).
- Làm bài: sinh viên đọc được môn; chỉ thấy đề Published; không bao giờ nhận đáp án/giải thích trước khi nộp.
- Đề thi (exam/midterm/final): 1 lần, chỉ trả điểm; đề luyện tập (practice): làm nhiều lần, xem đáp án sau khi nộp (BR-06).
- Giới hạn giờ tính theo đồng hồ server (started_at); nộp muộn quá 30 giây vẫn chấm nhưng đánh dấu `late`.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.orm import QUIZ_KINDS, CourseQuiz, QuizAttempt, User, new_id
from src.services import acl, audit
from src.services.errors import AppError, bad_request, forbidden, not_found

GRACE_S = 30
MAX_QUESTIONS = 100


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _iso(dt: datetime | None) -> str | None:
    return _aware(dt).isoformat(timespec="seconds") if dt else None


def _complete(q: dict[str, Any]) -> bool:
    opts = q.get("options") or []
    return (
        bool(str(q.get("text", "")).strip())
        and len(opts) == 4
        and all(str(o).strip() for o in opts)
        and q.get("correct") in (0, 1, 2, 3)
    )


def view(quiz: CourseQuiz, *, staff: bool) -> dict[str, Any]:
    """staff=True: đủ đáp án/giải thích (người phụ trách). staff=False: bỏ đáp án (sinh viên)."""
    qs = quiz.questions or []
    return {
        "id": quiz.id,
        "course_id": quiz.course_id,
        "title": quiz.title,
        "kind": quiz.kind,
        "time_limit_s": quiz.time_limit_s,
        "status": quiz.status,
        "question_count": len(qs),
        "updated_at": _iso(quiz.updated_at),
        "questions": [
            {
                k: q.get(k)
                for k in (("id", "text", "options", "correct", "explanation") if staff else ("id", "text", "options"))
            }
            for q in qs
        ],
    }


def get_manageable(db: Session, user: User, quiz_id: str) -> CourseQuiz:
    quiz = db.get(CourseQuiz, quiz_id)
    if quiz is None or not acl.can_manage_course(db, user, quiz.course_id):
        raise not_found()  # không lộ đề của môn không phụ trách
    return quiz


def get_takeable(db: Session, user: User, quiz_id: str) -> CourseQuiz:
    quiz = db.get(CourseQuiz, quiz_id)
    if quiz is None or quiz.status != "Published" or not acl.can_read_course(db, user, quiz.course_id):
        raise not_found()
    return quiz


def list_quizzes(db: Session, user: User, course_id: str) -> list[dict[str, Any]]:
    if acl.can_manage_course(db, user, course_id):
        rows = db.scalars(
            select(CourseQuiz).where(CourseQuiz.course_id == course_id).order_by(CourseQuiz.updated_at.desc())
        )
        return [view(q, staff=True) | {"questions": []} for q in rows]
    if not acl.can_read_course(db, user, course_id):
        return []
    rows = db.scalars(
        select(CourseQuiz)
        .where(CourseQuiz.course_id == course_id, CourseQuiz.status == "Published")
        .order_by(CourseQuiz.updated_at.desc())
    )
    out = []
    for q in rows:
        mine = db.scalars(
            select(QuizAttempt).where(QuizAttempt.quiz_id == q.id, QuizAttempt.student_id == user.id)
        ).all()
        done = [a for a in mine if a.submitted_at]
        best = max(done, key=lambda a: a.score or 0) if done else None
        out.append(
            view(q, staff=False)
            | {
                "questions": [],
                "attempts": len(done),
                "best_score": best.score if best else None,
                "best_total": best.total if best else None,
            }
        )
    return out


def _clean(payload: dict[str, Any]) -> dict[str, Any]:
    kind = payload.get("kind", "practice")
    if kind not in QUIZ_KINDS:
        raise bad_request("INVALID_QUIZ_KIND")
    limit = payload.get("time_limit_s")
    if limit is not None and not (10 <= int(limit) <= 6 * 3600):
        raise bad_request("INVALID_TIME_LIMIT")
    title = str(payload.get("title") or "").strip()[:300]
    if not title:
        raise bad_request("TITLE_REQUIRED")
    questions = []
    for q in (payload.get("questions") or [])[:MAX_QUESTIONS]:
        opts = [str(o)[:500] for o in (q.get("options") or [])][:4]
        opts += [""] * (4 - len(opts))
        correct = q.get("correct")
        questions.append(
            {
                "id": str(q.get("id") or new_id("q"))[:40],
                "text": str(q.get("text") or "")[:2000],
                "options": opts,
                "correct": correct if correct in (0, 1, 2, 3) else None,
                "explanation": str(q.get("explanation") or "")[:2000],
            }
        )
    return {
        "title": title,
        "kind": kind,
        "time_limit_s": int(limit) if limit is not None else None,
        "questions": questions,
    }


def create(db: Session, user: User, course_id: str, payload: dict[str, Any]) -> CourseQuiz:
    if not acl.can_manage_course(db, user, course_id):
        raise forbidden("NOT_COURSE_MANAGER")
    data = _clean(payload)
    quiz = CourseQuiz(course_id=course_id, author_id=user.id, **data)
    db.add(quiz)
    db.flush()
    audit.record(
        db, actor_id=user.id, action="quiz_create", object_type="course_quiz", object_id=quiz.id, course_id=course_id
    )
    db.commit()
    return quiz


def update(db: Session, user: User, quiz_id: str, payload: dict[str, Any]) -> CourseQuiz:
    quiz = get_manageable(db, user, quiz_id)
    if quiz.status != "Draft":
        raise AppError("QUIZ_NOT_DRAFT", 409, message="Chỉ sửa được đề ở trạng thái Nháp. Hãy đưa về Nháp trước.")
    data = _clean(payload)
    for k, v in data.items():
        setattr(quiz, k, v)
    db.commit()
    return quiz


def set_status(db: Session, user: User, quiz_id: str, status: str) -> CourseQuiz:
    quiz = get_manageable(db, user, quiz_id)
    allowed = {("Draft", "Published"), ("Published", "Closed"), ("Closed", "Published")}
    if status == "Draft" and quiz.status in ("Published", "Closed"):
        has_attempts = db.scalar(select(QuizAttempt.id).where(QuizAttempt.quiz_id == quiz.id).limit(1))
        if has_attempts:  # đề đã có bài làm thì không sửa đề (tránh chấm lệch)
            raise AppError("QUIZ_HAS_ATTEMPTS", 409, message="Đề đã có bài làm, không đưa về Nháp được.")
        allowed.add((quiz.status, "Draft"))
    if (quiz.status, status) not in allowed:
        raise AppError("INVALID_STATE", 409)
    if status == "Published" and (not quiz.questions or not all(_complete(q) for q in quiz.questions)):
        raise AppError("QUIZ_INCOMPLETE", 409, message="Mỗi câu cần nội dung, đủ 4 lựa chọn và 1 đáp án đúng.")
    quiz.status = status
    audit.record(
        db,
        actor_id=user.id,
        action=f"quiz_{status.lower()}",
        object_type="course_quiz",
        object_id=quiz.id,
        course_id=quiz.course_id,
    )
    db.commit()
    return quiz


def delete(db: Session, user: User, quiz_id: str) -> None:
    quiz = get_manageable(db, user, quiz_id)
    if quiz.status != "Draft":
        raise AppError("QUIZ_NOT_DRAFT", 409, message="Chỉ xóa được đề Nháp.")
    audit.record(
        db,
        actor_id=user.id,
        action="quiz_delete",
        object_type="course_quiz",
        object_id=quiz.id,
        course_id=quiz.course_id,
    )
    db.delete(quiz)
    db.commit()


def _deadline(quiz: CourseQuiz, attempt: QuizAttempt) -> datetime | None:
    return _aware(attempt.started_at) + timedelta(seconds=quiz.time_limit_s) if quiz.time_limit_s else None


def start(db: Session, user: User, quiz_id: str) -> dict[str, Any]:
    quiz = get_takeable(db, user, quiz_id)
    mine = db.scalars(
        select(QuizAttempt).where(QuizAttempt.quiz_id == quiz.id, QuizAttempt.student_id == user.id)
    ).all()
    open_attempt = next((a for a in mine if a.submitted_at is None), None)
    if quiz.kind != "practice" and any(a.submitted_at for a in mine):
        raise AppError("ALREADY_SUBMITTED", 409, message="Đề thi chỉ được làm một lần.")
    attempt = open_attempt or QuizAttempt(quiz_id=quiz.id, student_id=user.id)
    if open_attempt is None:
        db.add(attempt)
        db.commit()
    deadline = _deadline(quiz, attempt)
    return {"attempt_id": attempt.id, "deadline": _iso(deadline), "server_now": _iso(datetime.now(UTC))} | {
        "quiz": view(quiz, staff=False)
    }


def submit(db: Session, user: User, attempt_id: str, answers: dict[str, Any]) -> dict[str, Any]:
    attempt = db.get(QuizAttempt, attempt_id)
    if attempt is None or attempt.student_id != user.id:
        raise not_found()
    quiz = db.get(CourseQuiz, attempt.quiz_id)
    if attempt.submitted_at is not None:
        raise AppError("ALREADY_SUBMITTED", 409)
    if quiz is None or quiz.status != "Published" or not acl.can_read_course(db, user, quiz.course_id):
        raise AppError("QUIZ_CLOSED", 409, message="Đề đã đóng hoặc bạn không còn quyền làm bài.")
    picked = {str(k): v for k, v in (answers or {}).items() if v in (0, 1, 2, 3)}
    score = sum(1 for q in quiz.questions if picked.get(q["id"]) == q.get("correct"))
    now = datetime.now(UTC)
    deadline = _deadline(quiz, attempt)
    attempt.answers, attempt.score, attempt.total = picked, score, len(quiz.questions)
    attempt.late = bool(deadline and now > deadline + timedelta(seconds=GRACE_S))
    attempt.submitted_at = now
    db.commit()
    out: dict[str, Any] = {"score": score, "total": attempt.total, "late": attempt.late, "kind": quiz.kind}
    if quiz.kind == "practice":  # chỉ đề luyện tập mới trả đáp án + giải thích (BR-06)
        out["review"] = [
            {
                "id": q["id"],
                "correct": q.get("correct"),
                "picked": picked.get(q["id"]),
                "explanation": q.get("explanation"),
            }
            for q in quiz.questions
        ]
    return out


def results(db: Session, user: User, quiz_id: str) -> dict[str, Any]:
    quiz = get_manageable(db, user, quiz_id)
    rows = db.execute(
        select(QuizAttempt, User)
        .join(User, User.id == QuizAttempt.student_id)
        .where(QuizAttempt.quiz_id == quiz.id, QuizAttempt.submitted_at.is_not(None))
        .order_by(QuizAttempt.submitted_at.desc())
    ).all()
    per_q = {q["id"]: 0 for q in quiz.questions}
    for a, _ in rows:
        for q in quiz.questions:
            per_q[q["id"]] += int(a.answers.get(q["id"]) == q.get("correct"))
    return {
        "quiz": view(quiz, staff=True) | {"questions": []},
        "attempts": [
            {
                "student": u.display_name,
                "score": a.score,
                "total": a.total,
                "late": a.late,
                "submitted_at": _iso(a.submitted_at),
            }
            for a, u in rows
        ],
        "correct_rate": {qid: (n / len(rows) if rows else None) for qid, n in per_q.items()},
    }
