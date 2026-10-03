"""Hội thoại, gửi câu hỏi và lịch sử (FR-05; PRD 11.3–11.5).

Luồng gửi (PRD 11.5): authenticate → authorize conversation → integrity check → router chọn môn (trong các môn
được phép, D-28) + trợ lý →
persist user message → retrieval → evidence gate → LLM → citation validation → source re-authorization →
persist assistant message → return. LLM/RAG lỗi: user message vẫn lưu, KHÔNG có assistant message thành công.
"""

from __future__ import annotations

import copy
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.agents import orchestrator
from src.config import get_settings
from src.knowledge_hub import RetrievalError as KnowledgeHubRetrievalError
from src.models.orm import (
    Chunk,
    Citation,
    Conversation,
    Course,
    Document,
    DocumentVersion,
    Membership,
    Message,
    StudyPlan,
    UsageEvent,
    User,
    new_id,
)
from src.services import acl, audit, usage
from src.services.assistants import (
    AssistantResult,
    LlmError,
    attach_evidence,
    cited_pages,
    learning,
    name_sources,
    occurrence_evidence,
    supporting_quotes,
    track_usage,
)
from src.services.errors import AppError, bad_request, forbidden, not_found
from src.services.policy import SOURCE_WITHDRAWN_MESSAGE
from src.services.retrieval import EmbeddingUnavailableError, document_scope, still_servable

ASSISTANTS = ("academic", "learning", "hub")
MODES = ("auto", *ASSISTANTS)  # "auto" = router điều phối (FR-11); còn lại = chuyển thủ công (FR-11.5)
QUOTE_CHARS = 400


# ---------------------------------------------------------------- hội thoại


def scoped_document(db: Session, user: User, document_id: str) -> Document:
    doc = db.get(Document, document_id)
    if doc is None or not acl.can_read_course(db, user, doc.course_id):
        raise not_found()
    version = db.get(DocumentVersion, doc.current_version_id) if doc.current_version_id else None
    if version is None or not acl.can_serve_version(db, user, version, doc):
        raise AppError("SOURCE_UNAVAILABLE", 410, message=SOURCE_WITHDRAWN_MESSAGE)
    return doc


def create(
    db: Session, user: User, course_id: str | None, assistant: str, title: str | None, document_id: str | None = None
) -> Conversation:
    """course_id None (mặc định, D-28): router chọn môn theo từng câu hỏi. Có course_id: cố định một môn."""
    if assistant not in MODES:
        raise bad_request("INVALID_ASSISTANT")
    if document_id:
        doc = scoped_document(db, user, document_id)
        if course_id is not None and course_id != doc.course_id:
            raise bad_request("DOCUMENT_COURSE_MISMATCH")
        course_id = doc.course_id
        title = title or f"Hỏi về: {doc.title}"
    if course_id is not None and not acl.can_read_course(db, user, course_id):
        raise forbidden("COURSE_NOT_ALLOWED")  # BR-02: không tin course do client gửi
    conv = Conversation(
        owner_id=user.id,
        course_id=course_id,
        assistant_mode=assistant,
        title=(title or "Hội thoại mới")[:300],
        document_id=document_id,
    )
    db.add(conv)
    db.commit()
    return conv


def get_owned(db: Session, user: User, conversation_id: str) -> Conversation:
    conv = db.get(Conversation, conversation_id)
    if conv is None or conv.owner_id != user.id or conv.deleted_at is not None:
        raise not_found()  # không tiết lộ hội thoại người khác có tồn tại (AC-05.1)
    return conv


def replay(db: Session, user: User, conv: Conversation, cached: dict[str, Any]) -> dict[str, Any]:
    """Never return cached answer text without checking current source permissions."""
    msg = db.get(Message, cached.get("message_id") or cached.get("answer_id"))
    if msg is None or msg.conversation_id != conv.id or msg.role != "assistant":
        raise not_found()
    return serialize(db, user, msg, conv)


def list_owned(db: Session, user: User, limit: int, cursor: int) -> tuple[list[Conversation], int | None]:
    rows = list(
        db.scalars(
            select(Conversation)
            .where(Conversation.owner_id == user.id, Conversation.deleted_at.is_(None))
            .order_by(Conversation.updated_at.desc())
            .offset(cursor)
            .limit(limit + 1)
        )
    )
    return rows[:limit], (cursor + limit if len(rows) > limit else None)


def rename(db: Session, user: User, conversation_id: str, title: str) -> Conversation:
    conv = get_owned(db, user, conversation_id)
    conv.title = title.strip()[:300] or conv.title
    db.commit()
    return conv


def delete_all(db: Session, user: User) -> int:
    """FR-05.7 cho toàn bộ lịch sử: chỉ hội thoại của CHÍNH user từ token (BR-02), xóa mềm như `delete`."""
    rows = db.scalars(
        select(Conversation).where(Conversation.owner_id == user.id, Conversation.deleted_at.is_(None))
    ).all()
    stamp = datetime.now(UTC)
    for conv in rows:
        conv.deleted_at = stamp
    db.commit()
    return len(rows)


def delete(db: Session, user: User, conversation_id: str) -> None:
    """FR-05.7: ẩn ngay khi server xác nhận; dọn dữ liệu theo retention (MVP: xóa mềm)."""
    conv = get_owned(db, user, conversation_id)
    conv.deleted_at = datetime.now(UTC)
    db.commit()


# ---------------------------------------------------------------- hiển thị message


def serialize(db: Session, user: User, msg: Message, conv: Conversation) -> dict[str, Any]:
    """Định dạng PRD 11.3; kiểm tra lại quyền nguồn khi đọc lại, che nếu mất quyền (FR-05.4)."""
    citations, masked = [], False
    for c in msg.citations:
        if not still_servable(db, user, c.version_id):
            masked = True
            break
        chunk = db.get(Chunk, c.chunk_id)
        citations.append(
            {
                "id": str(c.ordinal),
                "citation_id": c.id,
                "document_id": c.document_id,
                "document_title": db.get(Document, c.document_id).title,
                "version_id": c.version_id,
                "chunk_id": c.chunk_id,
                "locator": {
                    "type": c.locator_type,
                    "value": c.locator_value,
                    "end": c.locator_end,
                    "section": chunk.section if chunk is not None else None,
                },
                "quote": c.quote,
            }
        )
    payload = copy.deepcopy(msg.payload or {})
    content = msg.content
    if payload.get("plan_id"):
        plan = db.get(StudyPlan, payload["plan_id"])
        view = plan_view(db, user, plan) if plan and plan.owner_id == user.id else None
        payload["plan"] = view
        if view is None or view["masked"]:
            masked = True  # Plan provenance also protects chat after citations are cleaned up.
    if masked:  # không tách an toàn được → che cả message
        content, citations, payload = SOURCE_WITHDRAWN_MESSAGE, [], {"kind": payload.get("kind"), "masked": True}
    elif payload.get("kind") == "hub":
        before = payload.get("results", [])
        payload["results"] = [r for r in before if still_servable(db, user, r["version_id"])]
        if before and not payload["results"]:  # mọi tài liệu từng tìm thấy đều không còn phục vụ (FR-05.4)
            content, payload["masked"] = SOURCE_WITHDRAWN_MESSAGE, True
        for r in payload["results"]:
            r["can_download"] = _can_download(db, user, r["version_id"])
    return {
        "request_id": msg.request_id,
        "answer_id": msg.id if msg.role == "assistant" else None,
        "conversation_id": conv.id,
        "message_id": msg.id,
        "role": msg.role,
        "assistant": msg.assistant,
        "status": msg.status,
        "content": content,
        "citations": citations,
        "created_at": _iso(msg.created_at),
        "metadata": {"course_id": message_course(msg, conv), **payload},
    }


def _iso(dt: datetime) -> str:
    return (dt if dt.tzinfo else dt.replace(tzinfo=UTC)).isoformat(timespec="seconds")


def _can_download(db: Session, user: User, version_id: str) -> bool:
    from src.models.orm import Document, DocumentVersion

    v = db.get(DocumentVersion, version_id)
    return bool(v and acl.can_download_version(db, user, v, db.get(Document, v.document_id)))


def list_messages(
    db: Session, user: User, conversation_id: str, limit: int, cursor: int
) -> tuple[list[dict], int | None]:
    conv = get_owned(db, user, conversation_id)
    rows = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at, Message.id)
            .offset(cursor)
            .limit(limit + 1)
        )
    )
    return [serialize(db, user, m, conv) for m in rows[:limit]], (cursor + limit if len(rows) > limit else None)


# ---------------------------------------------------------------- gửi câu hỏi


def _history(db: Session, conv: Conversation, before_id: str) -> list[tuple[str, str]]:
    msgs = db.scalars(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at, Message.id)
    )
    out = []
    for m in msgs:
        if m.id == before_id:
            break
        current = serialize(db, db.get(User, conv.owner_id), m, conv)
        if not current["metadata"].get("masked"):
            out.append((m.role, current["content"]))
    return out


def _check_quota(db: Session, user: User) -> None:
    since = datetime.now(UTC) - timedelta(days=1)
    n = db.scalar(
        select(func.count())
        .select_from(UsageEvent)
        .where(
            UsageEvent.user_id == user.id,
            UsageEvent.created_at >= since,
            UsageEvent.assistant.is_(None) | UsageEvent.assistant.notin_(usage.NON_CHAT),  # chỉ đếm câu hỏi chat
        )
    )
    if (n or 0) >= get_settings().daily_question_quota:
        raise AppError("QUOTA_EXCEEDED", 429, retryable=True, retry_after=3600)


def _persist_answer(
    db: Session, conv: Conversation, request_id: str, assistant: str, result: AssistantResult
) -> Message:
    payload = copy.deepcopy(result.payload or {})
    result.content = name_sources(result.content, result.used)  # D-58: "nguồn 1" → tên tài liệu
    answer = result.content
    if result.used:  # D-56: đoạn trích riêng cho từng lần [n] xuất hiện, hiện ngay tại [n] trong chat
        payload["evidence"] = occurrence_evidence(result.content, result.used)
        # D-57: hoạt động học gắn [n] ở từng mục → dẫn chứng riêng từng mục, và lấy các mục đó làm "ý" để tính trang
        answer = f"{result.content}\n{attach_evidence(payload, result.used)}"
    fallback_quotes = supporting_quotes(answer, result.used, {}) if result.used else {}
    msg = Message(
        conversation_id=conv.id,
        role="assistant",
        content=result.content,
        status=result.status,
        assistant=assistant,
        request_id=request_id,
        payload=payload,
    )
    db.add(msg)
    db.flush()
    for n, hit in result.used:
        quote = result.quotes.get(n) or fallback_quotes.get(n) or hit.chunk.text[:QUOTE_CHARS]
        first, last = cited_pages(hit.chunk, quote, answer, n)  # D-50: ý có thể trải nhiều trang
        db.add(
            Citation(
                message_id=msg.id,
                ordinal=n,
                chunk_id=hit.chunk.id,
                version_id=hit.version.id,
                document_id=hit.document.id,
                locator_type=hit.chunk.locator_type,
                locator_value=first,  # D-49: trang thật trong chunk nhiều trang, không phải trang đầu chunk
                locator_end=last if last != first else None,
                quote=quote,
                source_revision=hit.version.revision,
            )
        )
    return msg


def send(db: Session, user: User, conversation_id: str, body: dict[str, Any], request_id: str | None) -> dict[str, Any]:
    conv = get_owned(db, user, conversation_id)
    if conv.document_id:
        scoped_document(db, user, conv.document_id)
    # Router chỉ được chọn trong các môn user đang được đọc (BR-02); hội thoại cố định môn thì chỉ môn đó
    readable = acl.readable_course_ids(db, user)
    candidates = [conv.course_id] if conv.course_id else readable
    options = body.get("learning") or {}
    for linked_id in (options.get("plan_id"), options.get("previous_plan_id")):
        if linked_id and plan_view(db, user, get_plan(db, user, linked_id))["masked"]:
            raise AppError("SOURCE_UNAVAILABLE", 410, message=SOURCE_WITHDRAWN_MESSAGE)
    plan_id = options.get("plan_id")
    if plan_id:  # D-37: bài ôn tập của một buổi trong lộ trình — môn lấy từ lộ trình của chính user
        candidates = [get_plan(db, user, plan_id).course_id]
        if candidates[0] not in readable:
            raise forbidden("COURSE_NOT_ALLOWED")
    if conv.course_id and conv.course_id not in readable:
        raise forbidden("COURSE_NOT_ALLOWED")
    courses = [(cid, course_name(db, cid)) for cid in candidates]
    content = str(body.get("content") or "").strip()
    if not content:
        raise bad_request("EMPTY_MESSAGE")
    if len(content) > get_settings().chat_max_input_chars:
        raise bad_request("MESSAGE_TOO_LONG")
    mode = body.get("assistant") or "auto"
    if mode not in MODES:
        raise bad_request("INVALID_ASSISTANT")
    request_id = request_id or new_id("req")

    # Retry cùng request ID: không tạo user message trùng; đã có câu trả lời thì trả lại (AC-02.6, AC-05.3)
    existing_answer = db.scalar(
        select(Message).where(
            Message.conversation_id == conv.id, Message.request_id == request_id, Message.role == "assistant"
        )
    )
    if existing_answer is not None:
        return serialize(db, user, existing_answer, conv)
    user_msg = db.scalar(
        select(Message).where(
            Message.conversation_id == conv.id, Message.request_id == request_id, Message.role == "user"
        )
    )
    if user_msg is None:
        _check_quota(db, user)
        user_msg = Message(
            conversation_id=conv.id,
            role="user",
            content=content,
            request_id=request_id,
            assistant=mode,
            payload={"learning": body.get("learning")} if body.get("learning") else {},
        )
        db.add(user_msg)
        if conv.title == "Hội thoại mới":
            conv.title = content[:80]
        conv.assistant_mode = mode
        db.commit()

    started = time.perf_counter()
    status, chosen, routed_course = "error", mode, None
    with track_usage() as tokens:  # D-60: token của router + trợ lý → chi phí
        try:
            with document_scope(conv.document_id):
                result, trace = orchestrator.run(
                    db=db,
                    user=user,
                    courses=courses,
                    previous_course_id=_previous_course(db, conv, user_msg.id),
                    request_id=request_id,
                    question=content,
                    history=_history(db, conv, user_msg.id),
                    mode=mode,
                    options=body.get("learning") or {},
                )
            chosen = trace["assistant"] if trace["assistant"] in ASSISTANTS else "router"
            routed_course = trace.get("course_id")
            result.payload["route"] = trace  # trace điều phối (AC-11.5), hiển thị "Router: đã chọn …" (FR-11.5)
            msg = _persist_answer(db, conv, request_id, chosen, result)
            if result.payload.get("plan_data") is not None:
                _attach_plan(db, user, conv, msg, result, routed_course)
            status = result.status
            db.commit()
            return serialize(db, user, msg, conv)
        except EmbeddingUnavailableError as e:
            db.rollback()
            code = "EMBEDDING_RATE_LIMITED" if e.rate_limited else "EMBEDDING_UNAVAILABLE"
            raise AppError(code, 503, retryable=True) from e
        except KnowledgeHubRetrievalError as e:
            db.rollback()
            raise AppError("RETRIEVAL_UNAVAILABLE", 503, retryable=True) from e
        except LlmError as e:
            db.rollback()
            raise AppError("LLM_UNAVAILABLE", 503, retryable=True) from e
        finally:
            usage.record(
                db,
                user_id=user.id,
                course_id=routed_course,
                assistant=chosen,
                status=status,
                latency_ms=(time.perf_counter() - started) * 1000,
                request_id=request_id,
                tokens=tokens,
            )
            db.commit()


# ---------------------------------------------------------------- lộ trình học (FR-03.5–03.13)


def _attach_plan(
    db: Session, user: User, conv: Conversation, msg: Message, result: AssistantResult, course_id: str | None
) -> None:
    d = result.payload.pop("plan_data")
    plan = StudyPlan(
        owner_id=user.id, course_id=course_id, conversation_id=conv.id, version=d["previous_version"] + 1,
        previous_id=d["previous_id"], status="Draft", goal=d["goal"][:2000], days=d["days"], minutes_per_day=d["minutes"],
        data={k: d[k] for k in ("sessions", "warnings", "total_minutes", "budget_minutes")}
        | {"message_id": msg.id, "source_versions": {str(n): hit.version.id for n, hit in result.used}}
        | ({"dates": d["dates"]} if d.get("dates") else {}),
    )  # fmt: skip
    db.add(plan)
    db.flush()
    rest = {k: v for k, v in (msg.payload or {}).items() if k != "plan_data"}  # plan_data đã lưu vào study_plans
    msg.payload = {**rest, "kind": "plan", "plan_id": plan.id}


def get_plan(db: Session, user: User, plan_id: str) -> StudyPlan:
    plan = db.get(StudyPlan, plan_id)
    if plan is None or plan.owner_id != user.id:
        raise not_found()  # AC-03.10: chỉ người sở hữu xem được
    return plan


def plan_view(db: Session, user: User, plan: StudyPlan) -> dict[str, Any]:
    """One fail-closed view for chat, detail, list and export (FR-03.9/05.4, BR-10).

    Goal/warnings and cross-session content cannot be separated safely yet: loss
    of any dependency masks the entire plan, not just its source links.
    """
    if plan.owner_id != user.id:
        raise not_found()
    # Recheck current principal/membership, including changes during a long request.
    db.refresh(user)
    db.scalars(select(Membership).where(Membership.user_id == user.id).execution_options(populate_existing=True)).all()
    permitted = acl.can_read_course(db, user, plan.course_id)
    course = db.get(Course, plan.course_id)
    if course is not None:
        db.refresh(course)
    permitted = permitted and course is not None and course.status != "withdrawn"

    data = plan.data or {}
    if "source_versions" in data:
        sources = data["source_versions"]
    else:  # Legacy plans: recover provenance without relying on cached relationships.
        msg = db.get(Message, data.get("message_id")) if data.get("message_id") else None
        conv = db.get(Conversation, msg.conversation_id) if msg else None
        sources = (
            dict(db.execute(select(Citation.ordinal, Citation.version_id).where(Citation.message_id == msg.id)).all())
            if msg and conv and conv.owner_id == user.id and msg.conversation_id == plan.conversation_id
            else {}
        )
    sources = {str(n): v for n, v in sources.items()} if isinstance(sources, dict) else {}
    sessions = data.get("sessions", [])
    masked = not permitted or not sources
    if not masked:
        masked = any(not v or not still_servable(db, user, v) for v in sources.values()) or any(
            str(n) not in sources for s in sessions for n in s.get("sources", [])
        )
    if masked:
        # Whitelist only scheduling/progress. Drop evidence/proof and unknown text fields.
        sessions = [
            {
                **{k: s[k] for k in ("id", "day", "minutes", "status") if k in s},
                "title": SOURCE_WITHDRAWN_MESSAGE,
                "objective": "",
                "activity": "",
                "self_check": "",
                "sources": [],
                "missing_source": True,
                "needs_update": True,
            }
            for s in sessions
        ]
    else:
        sessions = [{**copy.deepcopy(s), "needs_update": False} for s in sessions]
    return {
        "id": plan.id, "version": plan.version, "previous_id": plan.previous_id, "status": plan.status,
        "goal": SOURCE_WITHDRAWN_MESSAGE if masked else plan.goal,
        "days": plan.days, "minutes_per_day": plan.minutes_per_day, "sessions": sessions,
        "warnings": [SOURCE_WITHDRAWN_MESSAGE] if masked else copy.deepcopy(data.get("warnings", [])),
        "total_minutes": data.get("total_minutes"), "budget_minutes": data.get("budget_minutes"),
        "dates": copy.deepcopy(data.get("dates")), "masked": masked,
    }  # fmt: skip


def confirm_plan(db: Session, user: User, plan_id: str) -> StudyPlan:
    plan = get_plan(db, user, plan_id)
    if plan.status != "Draft":
        raise AppError("INVALID_STATE", 409)
    plan.status = "Confirmed"  # FR-03.9: chỉ bản xác nhận mới là kế hoạch đang thực hiện
    if plan.previous_id:
        prev = db.get(StudyPlan, plan.previous_id)
        if prev and prev.status in ("Confirmed", "InProgress", "Paused"):
            prev.status = "Superseded"  # giữ dấu vết bản trước (FR-03.12)
    db.commit()
    return plan


def update_session(db: Session, user: User, plan_id: str, session_id: str, status: str) -> StudyPlan:
    if status not in ("not_started", "in_progress", "done"):
        raise bad_request("INVALID_SESSION_STATUS")
    plan = get_plan(db, user, plan_id)
    if plan.status not in ("Confirmed", "InProgress"):
        raise AppError("PLAN_NOT_ACTIVE", 409)
    sessions = [dict(s) for s in plan.data.get("sessions", [])]
    target = next((s for s in sessions if s["id"] == session_id), None)
    if target is None:
        raise not_found()
    target["status"] = status  # FR-03.10: theo thao tác người dùng, mở tài liệu không tự tính là xong
    plan.data = {**plan.data, "sessions": sessions}
    plan.status = "Completed" if all(s["status"] == "done" for s in sessions) else "InProgress"
    db.commit()
    return plan


def set_plan_status(db: Session, user: User, plan_id: str, status: str) -> StudyPlan:
    if status not in ("Paused", "Cancelled", "InProgress"):
        raise bad_request("INVALID_PLAN_STATUS")
    plan = get_plan(db, user, plan_id)
    if plan.status in ("Completed", "Cancelled", "Superseded", "Draft"):
        raise AppError("INVALID_STATE", 409)
    plan.status = status
    db.commit()
    return plan


EDITABLE_PLAN = ("Draft", "Confirmed", "InProgress", "Paused")


def update_plan(db: Session, user: User, plan_id: str, goal: str, sessions: list[dict[str, Any]]) -> StudyPlan:
    """Người học tự sửa lộ trình của mình (D-43): mục tiêu, thêm/bớt/sửa buổi. Giữ trạng thái + nguồn của buổi cũ."""
    plan = get_plan(db, user, plan_id)
    if plan.status not in EDITABLE_PLAN:
        raise AppError("INVALID_STATE", 409)
    if not sessions:
        raise bad_request("PLAN_EMPTY")
    dates = plan.data.get("dates") or []
    if dates and any(s["day"] > len(dates) for s in sessions):
        raise bad_request("PLAN_DAY_OUT_OF_RANGE")
    old = {s["id"]: s for s in plan.data.get("sessions", [])}
    taken = {int(k[1:]) for k in old if k[1:].isdigit()}
    out = []
    for s in sessions:
        prev = old.get(s.get("id") or "")
        if prev is None:  # buổi mới do người học thêm: id mới, chưa có nguồn
            n = max(taken, default=0) + 1
            taken.add(n)
            prev = {"id": f"s{n}", "sources": [], "missing_source": True, "status": "not_started"}
        out.append({**prev, **{k: s[k] for k in ("day", "title", "objective", "activity", "self_check", "minutes")}})
    out.sort(key=lambda s: (s["day"], s["id"]))
    plan.goal = goal
    plan.days = len(dates) if dates else max(s["day"] for s in out)
    total = sum(s["minutes"] for s in out)
    plan.data = {**plan.data, "sessions": out, "total_minutes": total, "edited": True}
    if plan.status in ("Confirmed", "InProgress"):
        plan.status = "Completed" if all(s["status"] == "done" for s in out) else plan.status
    audit.record(db, actor_id=user.id, action="plan_edit", object_type="study_plan", object_id=plan.id,
                 course_id=plan.course_id, detail={"sessions": len(out)})  # fmt: skip
    db.commit()
    return plan


def delete_plan(db: Session, user: User, plan_id: str) -> None:
    """Xoá lộ trình của chính mình (D-43). Tin nhắn chat từng tạo nó chỉ còn nội dung, thẻ lộ trình biến mất."""
    plan = get_plan(db, user, plan_id)
    audit.record(db, actor_id=user.id, action="plan_delete", object_type="study_plan", object_id=plan.id,
                 course_id=plan.course_id, detail={"goal": plan.goal[:200], "status": plan.status})  # fmt: skip
    db.delete(plan)
    db.commit()


# ---------------------------------------------------------------- tự kiểm tra (FR-03.3–03.4)


def save_quiz_answers(
    db: Session, user: User, message_id: str, answers: dict[str, str], submit: bool
) -> dict[str, Any]:
    msg = db.get(Message, message_id)
    if msg is None or (msg.payload or {}).get("kind") != "quiz":
        raise not_found()
    conv = get_owned(db, user, msg.conversation_id)
    if any(not still_servable(db, user, c.version_id) for c in msg.citations):
        raise AppError("SOURCE_UNAVAILABLE", 410, message=SOURCE_WITHDRAWN_MESSAGE)
    payload = dict(msg.payload)
    ids = {q["id"] for q in payload.get("questions", [])}
    payload["answers"] = {**payload.get("answers", {}), **{k: str(v)[:2000] for k, v in answers.items() if k in ids}}
    if submit:
        chunks = []
        for c in msg.citations:
            if still_servable(db, user, c.version_id):
                ch = db.get(Chunk, c.chunk_id)
                chunks.append(f"[{c.ordinal}] {ch.text if ch else c.quote}")
        started = time.perf_counter()
        with track_usage() as tokens:
            try:
                payload["assessment"] = learning.assess(
                    payload.get("questions", []), payload["answers"], "\n\n".join(chunks)
                )
            except LlmError as e:
                db.rollback()
                raise AppError("LLM_UNAVAILABLE", 503, retryable=True) from e
        usage.record(db, user_id=user.id, course_id=message_course(msg, conv), assistant="quiz_assess",
                     status="answered", latency_ms=(time.perf_counter() - started) * 1000, request_id=None,
                     tokens=tokens)  # fmt: skip
    msg.payload = payload
    db.commit()
    return serialize(db, user, msg, conv)


def message_course(msg: Message, conv: Conversation) -> str | None:
    """Môn router đã chọn cho câu trả lời (D-28); hội thoại cố định môn thì lấy môn của hội thoại."""
    return ((msg.payload or {}).get("route") or {}).get("course_id") or conv.course_id


def _previous_course(db: Session, conv: Conversation, before_id: str) -> str | None:
    """Môn của câu trả lời gần nhất — router dùng làm gợi ý cho câu nối tiếp."""
    last = None
    for m in db.scalars(
        select(Message)
        .where(Message.conversation_id == conv.id, Message.role == "assistant")
        .order_by(Message.created_at, Message.id)
    ):
        if m.id == before_id:
            break
        last = message_course(m, conv) or last
    return last


def course_name(db: Session, course_id: str) -> str:
    c = db.get(Course, course_id)
    return c.name if c else course_id
