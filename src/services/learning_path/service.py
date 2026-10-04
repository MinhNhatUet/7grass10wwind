"""Luồng đánh giá theo tiến độ → chẩn đoán → chọn lộ trình → lộ trình cụ thể → theo dõi tiến độ (D-82, FR-03.2–03.12).

Quyền (server quyết định, không tin client — BR-02): mọi thao tác kiểm `can_read_course` ở chính request; bản ghi chỉ
chủ sở hữu thấy (404 cho cả "không có" và "không phải của bạn"). Truy xuất nguồn lọc quyền trước (BR-03), nguồn của
từng câu được kiểm lại trước khi trả (câu có nguồn vừa mất quyền bị ẩn và không chấm — BR-10).
LLM chỉ SOẠN câu hỏi; bài/chủ đề/mục tiêu của câu do server gán theo khung đề, nguồn phải thuộc đúng chủ đề và có câu
trích nguyên văn chứng minh đáp án (D-74). Chấm, chẩn đoán, gợi ý, lộ trình đều bằng code — tái lập và kiểm thử được.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import CourseQuiz, LearnerProgress, LearningAssessment, LearningPath, TopicMastery, User
from src.services import acl, usage
from src.services.assistants import (
    BASE_POLICY,
    AssistantResult,
    LlmError,
    balance_answers,
    call_json,
    dedupe_key,
    format_sources,
    json_dicts,
    quote_page,
    strip_citations,
    track_usage,
    verified_quote,
)
from src.services.assistants.academic import evidence
from src.services.course_quiz import _complete as quiz_question_complete
from src.services.errors import AppError, bad_request, not_found
from src.services.formatting import iso
from src.services.learning_path import diagnosis, roadmap
from src.services.learning_path.blueprint import Blueprint, Slot, build_blueprint
from src.services.learning_path.curriculum import Curriculum, CurriculumError, Topic, load_curriculum
from src.services.policy import INSUFFICIENT_MESSAGE, SOURCE_WITHDRAWN_MESSAGE
from src.services.retrieval import EmbeddingUnavailableError, Hit, document_scope, still_servable

HITS_PER_TOPIC = 2
SLOTS_PER_CALL = 8
STEP_STATUSES = ("not_started", "in_progress", "done")
NOT_ASSESSED_REASON = {
    "quota": "Vượt số câu tối đa của một lượt — sẽ được hỏi ở lượt kiểm tra sau.",
    "no_evidence": "Chưa có nguồn được phép đủ căn cứ để soạn câu hỏi cho chủ đề này.",
    "source_withdrawn": "Nguồn của câu hỏi không còn khả dụng — câu đã bị loại, không chấm.",
    "unanswered": "Bạn chưa trả lời câu nào của chủ đề này.",
}


# ---------------------------------------------------------------- phạm vi, chương trình học, tiến độ


def _course_curriculum(db: Session, user: User, course_id: str) -> Curriculum:
    if not acl.can_read_course(db, user, course_id):
        raise not_found()
    try:
        return load_curriculum(db, user, course_id)
    except CurriculumError as e:
        raise AppError("CURRICULUM_INVALID", 409, message=f"Đề cương môn học không hợp lệ: {e}") from e


CHAT_ENTRY_MESSAGE = (
    "Mình đánh giá theo đúng phần bạn đã học: chọn bài bạn đã học tới rồi bấm “Làm bài đánh giá”. "
    "Chấm xong, bạn sẽ thấy lỗ hổng theo từng chủ đề và chọn một trong 3 lộ trình để mình lập các bước cụ thể."
)


def chat_entry(db: Session, user: User, course_id: str) -> AssistantResult | None:
    """Chẩn đoán trong chat (D-30) → chạy luồng đánh giá theo tiến độ ngay trong thẻ chat, để kết quả dẫn tới lộ
    trình. Môn chưa dựng được chương trình học (chưa có tài liệu/đề cương lỗi) → None, chat dùng chẩn đoán cũ."""
    if not acl.can_read_course(db, user, course_id):
        return None
    try:
        if not load_curriculum(db, user, course_id).lessons:
            return None
    except CurriculumError:
        return None
    return AssistantResult(status="answered", content=CHAT_ENTRY_MESSAGE, payload={"kind": "learning_path"})


def curriculum_view(db: Session, user: User, course_id: str) -> dict[str, Any]:
    return _course_curriculum(db, user, course_id).to_dict()


def _progress_row(db: Session, user: User, course_id: str) -> LearnerProgress | None:
    return db.scalar(
        select(LearnerProgress).where(LearnerProgress.user_id == user.id, LearnerProgress.course_id == course_id)
    )


def _covered(curriculum: Curriculum, row: LearnerProgress | None) -> set[str]:
    """Bài đã học CÒN trong chương trình hiện tại (tài liệu bị thu hồi → bài đó tự rơi khỏi phạm vi)."""
    ids = {x.id for x in curriculum.lessons}
    return {lid for lid in (row.covered_lesson_ids if row else []) if lid in ids}


def _progress_out(curriculum: Curriculum, row: LearnerProgress | None) -> dict[str, Any]:
    covered = _covered(curriculum, row)
    current = curriculum.lesson(row.current_lesson_id) if row and row.current_lesson_id else None
    upcoming = curriculum.next_lessons(covered)
    return {
        "course_id": curriculum.course_id,
        "covered_lesson_ids": [x.id for x in curriculum.lessons if x.id in covered],
        "current_lesson": {"id": current.id, "title": current.title, "order": current.order} if current else None,
        "next_lesson": {"id": upcoming[0].id, "title": upcoming[0].title, "order": upcoming[0].order}
        if upcoming
        else None,
        "covered_topics": len(curriculum.topics(covered)),
        "total_topics": len(curriculum.topics()),
        "updated_at": iso(row.updated_at) if row else None,
    }


def get_progress(db: Session, user: User, course_id: str) -> dict[str, Any]:
    curriculum = _course_curriculum(db, user, course_id)
    return _progress_out(curriculum, _progress_row(db, user, course_id))


def _save_progress(db: Session, user: User, curriculum: Curriculum, covered: set[str]) -> LearnerProgress:
    row = _progress_row(db, user, curriculum.course_id)
    if row is None:
        row = LearnerProgress(user_id=user.id, course_id=curriculum.course_id)
        db.add(row)
    ordered = [x for x in curriculum.lessons if x.id in covered]
    # giữ cả bài đã học của chương trình cũ (vd tài liệu tạm thu hồi rồi phát hành lại) — chỉ ẩn khi đọc
    known = {x.id for x in curriculum.lessons}
    row.covered_lesson_ids = [x.id for x in ordered] + [i for i in (row.covered_lesson_ids or []) if i not in known]
    row.current_lesson_id = ordered[-1].id if ordered else None
    row.updated_at = datetime.now(UTC)
    return row


def set_progress(
    db: Session, user: User, course_id: str, current_lesson_id: str | None, covered_lesson_ids: list[str] | None
) -> dict[str, Any]:
    """Người học khai báo tiến độ: "đã học tới bài N" (= bài 1..N theo đề cương) hoặc danh sách bài cụ thể.
    Tiến độ là PHẠM VI đã học, không phải mức nắm vững — mức nắm vững chỉ đến từ bài đánh giá."""
    curriculum = _course_curriculum(db, user, course_id)
    if (current_lesson_id is None) == (covered_lesson_ids is None):
        raise bad_request("PROGRESS_INPUT", "Chọn bài đang học tới HOẶC danh sách bài đã học.")
    if current_lesson_id is not None:
        if curriculum.lesson(current_lesson_id) is None:
            raise bad_request("UNKNOWN_LESSON")
        covered = set(curriculum.lessons_upto(current_lesson_id))
    else:
        assert covered_lesson_ids is not None
        unknown = [x for x in covered_lesson_ids if curriculum.lesson(x) is None]
        if unknown:
            raise bad_request("UNKNOWN_LESSON")
        covered = set(covered_lesson_ids)
    row = _save_progress(db, user, curriculum, covered)
    db.commit()
    return _progress_out(curriculum, row)


# ---------------------------------------------------------------- mức nắm vững


def _mastery_rows(db: Session, user: User, course_id: str) -> dict[str, TopicMastery]:
    rows = db.scalars(select(TopicMastery).where(TopicMastery.user_id == user.id, TopicMastery.course_id == course_id))
    return {r.topic_id: r for r in rows}


def _as_dict(r: TopicMastery) -> dict[str, Any]:
    return {"correct": r.correct, "answered": r.answered, "mastery": r.mastery, "level": r.level,
            "confidence": r.confidence, "objectives": r.objectives or {}, "history": r.history or [],
            "last_assessment_id": r.last_assessment_id}  # fmt: skip


def mastery_map(db: Session, user: User, course_id: str) -> dict[str, dict[str, Any]]:
    return {k: _as_dict(r) for k, r in _mastery_rows(db, user, course_id).items()}


def mastery_view(db: Session, user: User, course_id: str) -> dict[str, Any]:
    """Tiến độ (đã học) và mức nắm vững hiển thị TÁCH BIỆT cho từng bài/chủ đề."""
    curriculum = _course_curriculum(db, user, course_id)
    covered = _covered(curriculum, _progress_row(db, user, course_id))
    mastery = mastery_map(db, user, course_id)
    lessons = []
    for lesson in curriculum.lessons:
        topics = []
        for t in lesson.topics:
            m = mastery.get(t.id)
            topics.append({"topic_id": t.id, "title": t.title, "level": m["level"] if m else diagnosis.INSUFFICIENT,
                           "mastery": m["mastery"] if m else None, "confidence": m["confidence"] if m else None,
                           "assessed": m is not None})  # fmt: skip
        lessons.append({"lesson_id": lesson.id, "order": lesson.order, "title": lesson.title,
                        "covered": lesson.id in covered, "topics": topics})  # fmt: skip
    return {"course_id": course_id, "source": curriculum.source, "lessons": lessons}


# ---------------------------------------------------------------- soạn bài đánh giá


def _bank_questions(db: Session, course_id: str, topic_ids: set[str]) -> dict[str, list[dict[str, Any]]]:
    """Câu do giảng viên soạn trong đề LUYỆN TẬP đã phát hành, có gắn chủ đề — ưu tiên dùng (đã qua người duyệt).
    Không bao giờ lấy đề thi/giữa kỳ/cuối kỳ (BR-06)."""
    out: dict[str, list[dict[str, Any]]] = {}
    quizzes = db.scalars(
        select(CourseQuiz).where(
            CourseQuiz.course_id == course_id, CourseQuiz.status == "Published", CourseQuiz.kind == "practice"
        )
    )
    for quiz in quizzes:
        for q in quiz.questions or []:
            if q.get("topic_id") in topic_ids and quiz_question_complete(q):
                out.setdefault(q["topic_id"], []).append({**q, "quiz_id": quiz.id})
    return out


def _topic_hits(db: Session, user: User, course_id: str, curriculum: Curriculum, topic: Topic) -> list[Hit]:
    lesson = curriculum.lesson_of(topic)
    with document_scope(lesson.document_id):  # bài gắn tài liệu → chỉ truy xuất trong tài liệu đó
        return evidence(db, user, course_id, topic.query or topic.title)[:HITS_PER_TOPIC]


GENERATE_INSTRUCTION = """Soạn câu hỏi trắc nghiệm 4 lựa chọn để ĐÁNH GIÁ mức nắm vững của sinh viên theo từng Ô.
Mỗi Ô gắn MỘT chủ đề và MỘT mục tiêu học tập: câu hỏi phải kiểm tra đúng mục tiêu đó (hiểu/vận dụng, không hỏi chi
tiết vụn vặt), chỉ dựa trên các NGUỒN được liệt kê cho Ô (thuộc tính nguon). Mỗi Ô đúng một câu.
- 1 đáp án đúng; 3 phương án nhiễu là các HIỂU NHẦM thường gặp, hợp lý, không đánh đố; không nhắc chữ cái A/B/C/D.
- "misconceptions": mảng 4 chuỗi theo thứ tự options — với phương án sai, 1 câu nêu hiểu nhầm mà người chọn nó đang mắc;
  phương án đúng để "".
- "explanation": 1–2 câu vì sao đáp án đúng, theo nguồn.
- "proof": câu CHÉP NGUYÊN VĂN (không dịch, 20–300 ký tự) từ nguồn "source" chứng minh đáp án đúng.
- Không viết [n] trong câu hỏi/lựa chọn. Không đủ căn cứ cho một Ô thì bỏ Ô đó, không bịa.
JSON: {"items":[{"slot":"s1","question":"...","options":["...","...","...","..."],"correct":0,"explanation":"...",
"misconceptions":["","...","...","..."],"source":n,"proof":"..."}]}"""


def _generate(
    db: Session, user: User, curriculum: Curriculum, slots: list[Slot], hits_by_topic: dict[str, list[Hit]]
) -> list[dict[str, Any]]:
    """Gọi LLM theo lô ô; mỗi câu được kiểm: ô hợp lệ, nguồn thuộc ĐÚNG chủ đề của ô và còn phục vụ, câu trích chứng
    minh có thật. Câu không đạt bị loại — ô đó để trống (không thay bằng câu không căn cứ)."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for start in range(0, len(slots), SLOTS_PER_CALL):
        batch = slots[start : start + SLOTS_PER_CALL]
        hits: list[Hit] = []
        number: dict[str, int] = {}  # chunk_id → số [n] trong khối NGUỒN của lô
        allowed: dict[str, list[int]] = {}
        for s in batch:
            for h in hits_by_topic.get(s.topic_id, []):
                if h.chunk.id not in number:
                    hits.append(h)
                    number[h.chunk.id] = len(hits)
                ns = allowed.setdefault(s.topic_id, [])
                if number[h.chunk.id] not in ns:
                    ns.append(number[h.chunk.id])
        lines = []
        for s in batch:
            t = curriculum.topic(s.topic_id)
            assert t is not None
            obj = next(o.text for o in t.objectives if o.id == s.objective_id)
            lines.append(f'<o slot="{s.id}" bai="{curriculum.lesson_of(t).title}" chu_de="{t.title}" '
                         f'muc_tieu="{obj}" nguon="{",".join(map(str, allowed[s.topic_id]))}"/>')  # fmt: skip
        data = call_json(
            BASE_POLICY,
            f"{GENERATE_INSTRUCTION}\n\nCÁC Ô:\n" + "\n".join(lines) + f"\n\nNGUỒN:\n{format_sources(hits)}",
            temperature=0.3,
        )
        by_slot = {s.id: s for s in batch}
        for it in json_dicts(data, "items"):
            slot = by_slot.pop(str(it.get("slot") or ""), None)
            if slot is None:
                continue
            q = _validated_item(db, user, it, slot, [hits[n - 1] for n in allowed[slot.topic_id]])
            if q is None or dedupe_key(q["text"]) in seen:
                by_slot[slot.id] = slot  # ô còn trống
                continue
            seen.add(dedupe_key(q["text"]))
            out.append(q)
    return out


def _validated_item(db: Session, user: User, it: dict[str, Any], slot: Slot, topic_hits: list[Hit]) -> dict | None:
    text = strip_citations(str(it.get("question") or "")).strip()
    opts = [strip_citations(str(o)).strip()[:300] for o in (it.get("options") or [])]
    try:
        correct = int(it.get("correct"))
    except (TypeError, ValueError):
        return None
    if not text or len(opts) != 4 or not all(opts) or len(set(opts)) != 4 or not 0 <= correct <= 3:
        return None
    # nguồn phải là đoạn của CHÍNH chủ đề ô này và câu trích phải có nguyên văn trong đó → câu gắn đúng chủ đề
    hit, proof = None, ""
    for h in topic_hits:
        if (p := verified_quote(it.get("proof"), h.chunk.text)) and still_servable(db, user, h.version.id):
            hit, proof = h, p
            break
    if hit is None:
        return None
    raw_mis = it.get("misconceptions") if isinstance(it.get("misconceptions"), list) else []
    misconceptions = {
        opts[i]: strip_citations(str(raw_mis[i]))[:300]
        for i in range(4)
        if i != correct and i < len(raw_mis) and str(raw_mis[i] or "").strip()
    }
    page = quote_page(hit.chunk, proof)
    return {
        "id": slot.id, "lesson_id": slot.lesson_id, "topic_id": slot.topic_id, "objective_id": slot.objective_id,
        "origin": "generated", "text": text[:800], "options": opts, "correct": correct,
        "explanation": strip_citations(str(it.get("explanation") or ""))[:600], "misconceptions": misconceptions,
        "proof": proof,
        "source": {"version_id": hit.version.id, "document_id": hit.document.id, "document_title": hit.document.title,
                   "chunk_id": hit.chunk.id, "page": page, "page_end": None},
    }  # fmt: skip


def _fill_from_bank(bp: Blueprint, bank: dict[str, list[dict[str, Any]]]) -> tuple[list[dict[str, Any]], list[Slot]]:
    filled, remaining = [], []
    used: set[tuple[str, str]] = set()
    for s in bp.slots:
        cands = [q for q in bank.get(s.topic_id, []) if (q["quiz_id"], q["id"]) not in used]
        exact = [q for q in cands if q.get("objective_id") == s.objective_id]
        pick = (exact or [q for q in cands if not q.get("objective_id")] or [None])[0]
        if pick is None:
            remaining.append(s)
            continue
        used.add((pick["quiz_id"], pick["id"]))
        filled.append({
            "id": s.id, "lesson_id": s.lesson_id, "topic_id": s.topic_id, "objective_id": s.objective_id,
            "origin": "bank", "quiz_ref": {"quiz_id": pick["quiz_id"], "question_id": pick["id"]},
            "text": pick["text"], "options": list(pick["options"]), "correct": pick["correct"],
            "explanation": pick.get("explanation") or "", "misconceptions": {}, "proof": "", "source": None,
        })  # fmt: skip
    return filled, remaining


def create_assessment(
    db: Session,
    user: User,
    course_id: str,
    topic_ids: list[str] | None = None,
    path_id: str | None = None,
    step_id: str | None = None,
) -> dict[str, Any]:
    """Bài đánh giá CHỈ trong phạm vi đã học. Checkpoint của lộ trình (path_id + step_id) lấy chủ đề của bước đó
    (vẫn giao với phạm vi đã học — bài mới chỉ được hỏi sau khi người học đánh dấu đã học)."""
    curriculum = _course_curriculum(db, user, course_id)
    if not curriculum.lessons:
        raise AppError("CURRICULUM_UNAVAILABLE", 409, message="Môn chưa có tài liệu/đề cương để dựng chương trình học.")
    progress = _progress_row(db, user, course_id)
    covered = _covered(curriculum, progress)
    if not covered:
        raise AppError(
            "PROGRESS_REQUIRED", 409, message="Hãy cho biết bạn đã học tới bài nào trước khi làm bài đánh giá."
        )
    purpose = "placement"
    if path_id or step_id:
        path = _owned_path(db, user, path_id or "")
        step = next((s for s in path.steps if s["id"] == step_id), None)
        if path.course_id != course_id or step is None or step["kind"] != "checkpoint":
            raise not_found()
        if path.status != "Active":
            raise AppError("PATH_NOT_ACTIVE", 409)
        topic_ids, purpose = list(step["assessment"]["topic_ids"]), "checkpoint"
    # dùng lại bài đang làm dở cùng phạm vi (không tốn lượt LLM, giữ câu trả lời đã lưu)
    for a in db.scalars(
        select(LearningAssessment).where(
            LearningAssessment.user_id == user.id,
            LearningAssessment.course_id == course_id,
            LearningAssessment.status == "Open",
            LearningAssessment.path_id.is_not_distinct_from(path_id),
            LearningAssessment.step_id.is_not_distinct_from(step_id),
        )  # fmt: skip
    ):
        same_scope = set(a.scope.get("lesson_ids", [])) == covered and a.scope.get("focus") == topic_ids
        if same_scope:
            return assessment_view(db, user, a)
        a.status = "Abandoned"  # phạm vi đã đổi (học thêm bài) → bài cũ không còn phản ánh đúng phạm vi
    settings = get_settings()
    bp = build_blueprint(curriculum, covered, mastery_map(db, user, course_id),
                         settings.learning_assessment_max_questions, topic_ids)  # fmt: skip
    if not bp.slots:
        raise AppError("NOTHING_IN_SCOPE", 409, message="Các chủ đề được chọn chưa nằm trong phạm vi bạn đã học.")
    questions, remaining = _fill_from_bank(bp, _bank_questions(db, course_id, set(bp.topic_ids)))
    started, status = time.perf_counter(), "error"
    with track_usage() as tokens:
        try:
            hits_by_topic: dict[str, list[Hit]] = {}
            for tid in dict.fromkeys(s.topic_id for s in remaining):
                topic = curriculum.topic(tid)
                assert topic is not None
                hits_by_topic[tid] = _topic_hits(db, user, course_id, curriculum, topic)
            pending = [s for s in remaining if hits_by_topic.get(s.topic_id)]
            if pending:
                questions += _generate(db, user, curriculum, pending, hits_by_topic)
            status = "answered" if questions else "insufficient_evidence"
        except EmbeddingUnavailableError as e:
            db.rollback()
            raise AppError("EMBEDDING_RATE_LIMITED" if e.rate_limited else "EMBEDDING_UNAVAILABLE", 503,
                           retryable=True) from e  # fmt: skip
        except LlmError as e:
            db.rollback()
            raise AppError("LLM_UNAVAILABLE", 503, retryable=True) from e
        finally:  # D-60: lượt lỗi vẫn có thể đã tốn token
            usage.record(db, user_id=user.id, course_id=course_id, assistant="learning_assessment", status=status,
                         latency_ms=(time.perf_counter() - started) * 1000, request_id=None, tokens=tokens)  # fmt: skip
            db.commit()
    if not questions:
        raise AppError("ASSESSMENT_NO_EVIDENCE", 422, message=INSUFFICIENT_MESSAGE)
    balance_answers([q for q in questions if q["origin"] == "generated"])  # D-69; hiểu nhầm gắn theo chữ, không lệch
    position = {s.id: i for i, s in enumerate(bp.slots)}
    questions.sort(key=lambda q: position[q["id"]])
    for i, q in enumerate(questions, start=1):
        q["id"] = f"q{i}"
    asked = {q["topic_id"] for q in questions}
    not_assessed = bp.deferred + [{"topic_id": t, "reason": "no_evidence"} for t in bp.topic_ids if t not in asked]
    a = LearningAssessment(
        user_id=user.id, course_id=course_id, purpose=purpose, path_id=path_id, step_id=step_id,
        scope={"lesson_ids": sorted(covered), "focus": topic_ids, "topic_ids": sorted(asked),
               "not_assessed": not_assessed, "excluded_out_of_scope": bp.excluded,
               "curriculum_source": curriculum.source},
        questions=questions,
    )  # fmt: skip
    db.add(a)
    db.commit()
    return assessment_view(db, user, a)


# ---------------------------------------------------------------- xem / nộp bài


def _owned_assessment(db: Session, user: User, assessment_id: str) -> LearningAssessment:
    a = db.get(LearningAssessment, assessment_id)
    if a is None or a.user_id != user.id or not acl.can_read_course(db, user, a.course_id):
        raise not_found()
    return a


def _unservable(db: Session, user: User, questions: list[dict[str, Any]]) -> set[str]:
    """Câu có nguồn vừa mất quyền/thu hồi → ẩn nội dung và không chấm (BR-03, BR-10)."""
    cache: dict[str, bool] = {}
    out = set()
    for q in questions:
        v = (q.get("source") or {}).get("version_id")
        if v is None:
            continue
        if v not in cache:
            cache[v] = still_servable(db, user, v)
        if not cache[v]:
            out.add(q["id"])
    return out


def _titles(curriculum: Curriculum, q: dict[str, Any]) -> dict[str, Any]:
    topic = curriculum.topic(q["topic_id"])
    if topic is None:
        return {"lesson_title": None, "topic_title": None, "objective": None}
    obj = next((o.text for o in topic.objectives if o.id == q["objective_id"]), None)
    return {"lesson_title": curriculum.lesson_of(topic).title, "topic_title": topic.title, "objective": obj}


def _scope_out(curriculum: Curriculum, scope: dict[str, Any]) -> dict[str, Any]:
    def title(tid: str) -> str | None:
        t = curriculum.topic(tid)
        return t.title if t else None

    return {
        "lessons": [{"id": x.id, "title": x.title, "order": x.order}
                    for x in curriculum.lessons if x.id in set(scope.get("lesson_ids", []))],
        "topic_count": len(scope.get("topic_ids", [])),
        "not_assessed": [{**n, "title": title(n["topic_id"]), "reason_text": NOT_ASSESSED_REASON.get(n["reason"], "")}
                         for n in scope.get("not_assessed", []) if title(n["topic_id"])],
        "excluded_out_of_scope": [{"topic_id": t, "title": title(t)} for t in scope.get("excluded_out_of_scope", [])],
    }  # fmt: skip


def assessment_view(db: Session, user: User, a: LearningAssessment) -> dict[str, Any]:
    """Trước khi nộp: KHÔNG có đáp án/giải thích/hiểu nhầm/nguồn. Sau khi nộp: thêm kết quả và phần xem lại."""
    curriculum = _course_curriculum(db, user, a.course_id)
    hidden = _unservable(db, user, a.questions)
    questions = []
    for q in a.questions:
        if q["id"] in hidden:
            questions.append({"id": q["id"], "withdrawn": True, "text": SOURCE_WITHDRAWN_MESSAGE, "options": []})
            continue
        item = {"id": q["id"], "text": q["text"], "options": q["options"], **_titles(curriculum, q),
                "picked": diagnosis.picked_index(a.answers.get(q["id"]))}  # fmt: skip
        if a.status == "Submitted":
            src = q.get("source")
            item.update({"correct": q["correct"], "explanation": q.get("explanation") or "", "proof": q.get("proof") or "",
                         "source": {k: src[k] for k in ("document_title", "page", "page_end")} if src else None})  # fmt: skip
        questions.append(item)
    return {
        "id": a.id, "course_id": a.course_id, "purpose": a.purpose, "status": a.status,
        "path_id": a.path_id, "step_id": a.step_id, "scope": _scope_out(curriculum, a.scope or {}),
        "questions": questions, "result": a.result if a.status == "Submitted" else None,
        "created_at": iso(a.created_at), "submitted_at": iso(a.submitted_at),
    }  # fmt: skip


def get_assessment(db: Session, user: User, assessment_id: str) -> dict[str, Any]:
    return assessment_view(db, user, _owned_assessment(db, user, assessment_id))


def list_assessments(db: Session, user: User, course_id: str) -> list[dict[str, Any]]:
    if not acl.can_read_course(db, user, course_id):
        return []
    rows = db.scalars(
        select(LearningAssessment)
        .where(LearningAssessment.user_id == user.id, LearningAssessment.course_id == course_id,
               LearningAssessment.status != "Abandoned")
        .order_by(LearningAssessment.created_at.desc())
    )  # fmt: skip
    return [
        {"id": a.id, "purpose": a.purpose, "status": a.status, "questions": len(a.questions),
         "score_pct": ((a.result or {}).get("summary") or {}).get("score_pct"),
         "gaps": len((a.result or {}).get("gaps") or []), "created_at": iso(a.created_at),
         "submitted_at": iso(a.submitted_at)}
        for a in rows
    ]  # fmt: skip


def save_answers(db: Session, user: User, assessment_id: str, answers: dict[str, Any]) -> dict[str, Any]:
    """Lưu tạm (FR-03.3) — không nộp thay người học."""
    a = _owned_assessment(db, user, assessment_id)
    if a.status != "Open":
        raise AppError("ALREADY_SUBMITTED", 409)
    a.answers = _clean_answers(a, answers)
    db.commit()
    return assessment_view(db, user, a)


def _clean_answers(a: LearningAssessment, answers: dict[str, Any]) -> dict[str, int]:
    ids = {q["id"] for q in a.questions}
    merged = {**(a.answers or {}), **{str(k): v for k, v in (answers or {}).items()}}
    return {k: v for k, v in merged.items() if k in ids and diagnosis.picked_index(v) is not None}


def submit_assessment(db: Session, user: User, assessment_id: str, answers: dict[str, Any]) -> dict[str, Any]:
    a = _owned_assessment(db, user, assessment_id)
    if a.status != "Open":
        raise AppError("ALREADY_SUBMITTED", 409)
    curriculum = _course_curriculum(db, user, a.course_id)
    a.answers = _clean_answers(a, answers)
    hidden = _unservable(db, user, a.questions)
    if not any(q["id"] in a.answers for q in a.questions if q["id"] not in hidden):
        raise bad_request("NO_ANSWERS", "Trả lời ít nhất một câu trước khi nộp.")
    now = datetime.now(UTC)
    graded = diagnosis.grade(a.questions, a.answers, hidden)
    rows = _mastery_rows(db, user, a.course_id)
    for topic_id, outcome in graded["topics"].items():
        topic = curriculum.topic(topic_id)
        if topic is None or outcome["answered"] == 0:
            continue
        prev = _as_dict(rows[topic_id]) if topic_id in rows else None
        new = diagnosis.update_mastery(prev, outcome, a.id, now.isoformat(timespec="seconds"))
        row = rows.get(topic_id) or TopicMastery(user_id=user.id, course_id=a.course_id, topic_id=topic_id)
        row.lesson_id, row.topic_title = topic.lesson_id, topic.title[:500]
        for k in (
            "correct",
            "answered",
            "mastery",
            "level",
            "confidence",
            "objectives",
            "history",
            "last_assessment_id",
        ):
            setattr(row, k, new[k])
        if topic_id not in rows:
            db.add(row)
            rows[topic_id] = row
    db.flush()
    mastery = {k: _as_dict(r) for k, r in rows.items()}
    covered = _covered(curriculum, _progress_row(db, user, a.course_id))
    refs = diagnosis.source_refs(a.questions, hidden)
    result = diagnosis.diagnose(curriculum, a.questions, graded, mastery, refs)
    unanswered = [{"topic_id": t, "reason": "unanswered"} for t, o in graded["topics"].items() if o["answered"] == 0]
    withdrawn = sorted({q["topic_id"] for q in a.questions if q["id"] in hidden})
    a.scope = {**a.scope, "not_assessed": [*a.scope.get("not_assessed", []), *unanswered,
                                           *({"topic_id": t, "reason": "source_withdrawn"} for t in withdrawn)]}  # fmt: skip
    strategy, why = roadmap.recommend_strategy(curriculum, covered, mastery)
    result.update({
        "recommendations": diagnosis.recommendations(curriculum, covered, mastery, refs),
        "path_options": roadmap.path_options(curriculum, covered, mastery, refs),
        "recommended_strategy": strategy, "recommended_reason": why,
    })  # fmt: skip
    a.result, a.status, a.submitted_at = result, "Submitted", now
    if a.purpose == "checkpoint" and a.path_id:
        _complete_checkpoint(db, user, a, mastery)
    db.commit()
    return assessment_view(db, user, a)


# ---------------------------------------------------------------- lộ trình


def _owned_path(db: Session, user: User, path_id: str) -> LearningPath:
    p = db.get(LearningPath, path_id)
    if p is None or p.user_id != user.id or not acl.can_read_course(db, user, p.course_id):
        raise not_found()
    return p


def choose_path(db: Session, user: User, assessment_id: str, strategy: str) -> dict[str, Any]:
    """Người học chọn một trong các phương án → lộ trình cụ thể theo mức nắm vững HIỆN TẠI (gồm các lần trước)."""
    if strategy not in roadmap.STRATEGIES:
        raise bad_request("INVALID_STRATEGY")
    a = _owned_assessment(db, user, assessment_id)
    if a.status != "Submitted":
        raise AppError("ASSESSMENT_NOT_SUBMITTED", 409)
    curriculum = _course_curriculum(db, user, a.course_id)
    covered = _covered(curriculum, _progress_row(db, user, a.course_id))
    hidden = _unservable(db, user, a.questions)
    refs = diagnosis.source_refs(a.questions, hidden)
    concepts = diagnosis.topic_concepts(curriculum, a.questions, a.answers, hidden)
    built = roadmap.build_roadmap(curriculum, covered, mastery_map(db, user, a.course_id), strategy, refs, concepts)
    for old in db.scalars(
        select(LearningPath).where(
            LearningPath.user_id == user.id, LearningPath.course_id == a.course_id, LearningPath.status == "Active"
        )  # fmt: skip
    ):
        old.status = "Superseded"  # giữ dấu vết bản trước (FR-03.12)
    path = LearningPath(
        user_id=user.id, course_id=a.course_id, assessment_id=a.id, strategy=strategy, steps=built["steps"],
        summary={k: built[k] for k in ("title", "description")} | built["summary"],
    )  # fmt: skip
    db.add(path)
    db.commit()
    return path_view(db, user, path)


def _unlock_text(steps: list[dict[str, Any]], step: dict[str, Any]) -> str:
    gate = roadmap.gate_of(steps, step)
    return f"Cần đạt ≥ {round(roadmap.PASS_MASTERY * 100)}% ở “{gate['title']}” để mở bước này." if gate else ""


def path_view(db: Session, user: User, path: LearningPath) -> dict[str, Any]:
    """Bước trỏ tới bài/chủ đề không còn trong chương trình user được thấy (tài liệu thu hồi/mất quyền) bị ẩn nội dung;
    nguồn từng bước được kiểm lại (BR-03, BR-10)."""
    curriculum = _course_curriculum(db, user, path.course_id)
    known_topics = {t.id for t in curriculum.topics()}
    servable: dict[str, bool] = {}
    steps = []
    for s in path.steps:
        if (s.get("lesson_id") and curriculum.lesson(s["lesson_id"]) is None) or any(
            t not in known_topics for t in s.get("topic_ids", [])
        ):
            steps.append({k: s[k] for k in ("id", "order", "kind", "status", "minutes")}
                         | {"title": SOURCE_WITHDRAWN_MESSAGE, "needs_update": True, "topic_ids": [], "sources": [],
                            "activities": [], "objectives": []})  # fmt: skip
            continue
        sources = []
        for r in s.get("sources", []):
            v = r.get("version_id")
            if v and v not in servable:
                servable[v] = still_servable(db, user, v)
            if not v or servable[v]:
                sources.append({k: r.get(k) for k in ("document_title", "page", "page_end")})
        locked = not roadmap.gate_open(path.steps, s)
        steps.append({**s, "sources": sources, "needs_update": False, "locked": locked,
                      "unlock": _unlock_text(path.steps, s) if locked else ""})  # fmt: skip
    nxt = next((s for s in steps if s["status"] != "done" and not s.get("needs_update") and not s.get("locked")), None)
    return {
        "id": path.id, "course_id": path.course_id, "assessment_id": path.assessment_id, "strategy": path.strategy,
        "status": path.status, "summary": path.summary, "steps": steps,
        "done": sum(1 for s in steps if s["status"] == "done"), "total": len(steps),
        "next_step_id": nxt["id"] if nxt else None,
        "created_at": iso(path.created_at), "updated_at": iso(path.updated_at),
    }  # fmt: skip


def get_path(db: Session, user: User, path_id: str) -> dict[str, Any]:
    path = _owned_path(db, user, path_id)
    if _repair_remediation(db, user, path):  # lộ trình tạo trước khi có vòng ôn lại: bài kiểm tra đã trượt
        db.commit()
    return path_view(db, user, path)


def list_paths(db: Session, user: User, course_id: str) -> list[dict[str, Any]]:
    if not acl.can_read_course(db, user, course_id):
        return []
    rows = db.scalars(
        select(LearningPath)
        .where(LearningPath.user_id == user.id, LearningPath.course_id == course_id)
        .order_by(LearningPath.created_at.desc())
    )
    return [
        {"id": p.id, "strategy": p.strategy, "title": (p.summary or {}).get("title"), "status": p.status,
         "done": sum(1 for s in p.steps if s["status"] == "done"), "total": len(p.steps),
         "created_at": iso(p.created_at)}
        for p in rows
    ]  # fmt: skip


def update_step(db: Session, user: User, path_id: str, step_id: str, status: str) -> dict[str, Any]:
    if status not in STEP_STATUSES:
        raise bad_request("INVALID_STEP_STATUS")
    path = _owned_path(db, user, path_id)
    if path.status != "Active":
        raise AppError("PATH_NOT_ACTIVE", 409)
    steps = [dict(s) for s in path.steps]
    step = next((s for s in steps if s["id"] == step_id), None)
    if step is None:
        raise not_found()
    if step["kind"] == "checkpoint" and status == "done":
        raise AppError("CHECKPOINT_NEEDS_ASSESSMENT", 409, message="Bước kiểm tra hoàn thành khi bạn nộp bài kiểm tra.")
    if status != "not_started" and not roadmap.gate_open(steps, step):
        raise AppError("STEP_LOCKED", 409, message="Cần đạt bài kiểm tra trước đó để mở bước này.")
    step["status"] = status  # theo thao tác người học (FR-03.10)
    if step["kind"] == "learn" and status == "done":
        curriculum = _course_curriculum(db, user, path.course_id)
        covered = _covered(curriculum, _progress_row(db, user, path.course_id)) | {step["completes_lesson"]}
        _save_progress(db, user, curriculum, covered)  # học xong bài mới → mở rộng PHẠM VI (chưa phải nắm vững)
    _finish(path, steps)
    db.commit()
    return path_view(db, user, path)


def _finish(path: LearningPath, steps: list[dict[str, Any]]) -> None:
    path.steps = steps
    if all(s["status"] == "done" for s in steps):
        path.status = "Completed"


def _complete_checkpoint(db: Session, user: User, a: LearningAssessment, mastery: dict[str, dict[str, Any]]) -> None:
    path = db.get(LearningPath, a.path_id)
    if path is None or path.user_id != user.id or path.status != "Active":
        return
    steps = [dict(s) for s in path.steps]
    step = next((s for s in steps if s["id"] == a.step_id), None)
    if step is None:
        return
    scope = [t for t in step["assessment"]["topic_ids"] if t in mastery]
    values = [mastery[t]["mastery"] or 0 for t in scope]
    avg = sum(values) / len(values) if values else 0
    summary = (a.result or {}).get("summary") or {}
    step["status"] = "done"
    step["result"] = {"assessment_id": a.id, "score_pct": summary.get("score_pct"), "mastery": round(avg, 3),
                      "passed": bool(values) and avg >= step["assessment"].get("pass_mastery", roadmap.PASS_MASTERY),
                      "gaps": len((a.result or {}).get("gaps") or [])}  # fmt: skip
    if not step["result"]["passed"]:  # chưa đạt → phải ôn lại và kiểm tra lại trước khi đi tiếp
        steps = _with_remediation(db, user, path, steps, step, a, mastery)
    _finish(path, steps)


def _with_remediation(
    db: Session,
    user: User,
    path: LearningPath,
    steps: list[dict[str, Any]],
    failed: dict[str, Any],
    a: LearningAssessment | None,
    mastery: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    curriculum = _course_curriculum(db, user, path.course_id)
    questions, answers = (a.questions, a.answers) if a else ([], {})
    hidden = _unservable(db, user, questions)
    new = roadmap.remediation(curriculum, steps, failed, mastery, diagnosis.source_refs(questions, hidden),
                              diagnosis.topic_concepts(curriculum, questions, answers, hidden))  # fmt: skip
    return roadmap.splice_after(steps, failed["id"], new)


def _repair_remediation(db: Session, user: User, path: LearningPath) -> bool:
    """Bài kiểm tra đã trượt nhưng chưa có vòng ôn lại (lộ trình tạo trước bản này) → chèn vòng ôn lại."""
    if path.status != "Active":
        return False
    steps = [dict(s) for s in path.steps]
    handled = {s.get("remediation_for") for s in steps}
    changed = False
    for cp in [s for s in steps if s["kind"] == "checkpoint" and s["status"] == "done"]:
        if (cp.get("result") or {}).get("passed") or cp["id"] in handled:
            continue
        a = db.get(LearningAssessment, (cp.get("result") or {}).get("assessment_id") or "")
        a = a if a is not None and a.user_id == user.id else None
        steps = _with_remediation(db, user, path, steps, cp, a, mastery_map(db, user, path.course_id))
        changed = True
    if changed:
        path.steps = steps
    return changed
