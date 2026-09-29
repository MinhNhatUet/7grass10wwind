"""Xem nguồn theo citation (UI-06; FR-10.6) và phản hồi câu trả lời (FR-05.5/05.6)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.deps import current_user
from src.db import get_db
from src.models.orm import Chunk, Citation, Conversation, Document, DocumentVersion, Feedback, Message, User
from src.services import acl, page_render
from src.services.conversations import get_owned, message_course
from src.services.errors import AppError, bad_request, not_found
from src.services.policy import SOURCE_WITHDRAWN_MESSAGE

router = APIRouter()


def _source(db: Session, user: User, chunk: Chunk, version: DocumentVersion, document: Document) -> dict[str, Any]:
    return {
        "document_id": document.id,
        "version_id": version.id,
        "title": document.title,
        "version_label": version.version_label,
        "doc_type": document.doc_type,
        "file_type": version.file_type,
        "page_count": version.page_count,
        "locator": {"type": chunk.locator_type, "value": chunk.locator_value},
        "excerpt": chunk.text,
        "can_download": acl.can_download_version(db, user, version, document),
    }


@router.get("/citations/{citation_id}/source")
def citation_source(
    citation_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Kiểm tra user, hội thoại, môn, ACL, version, thu hồi, chunk trước khi trả excerpt (PRD 11.2)."""
    cit = db.get(Citation, citation_id)
    if cit is None:
        raise not_found()
    msg = db.get(Message, cit.message_id)
    get_owned(db, user, msg.conversation_id)  # chỉ owner hội thoại
    version = db.get(DocumentVersion, cit.version_id)
    document = db.get(Document, cit.document_id)
    chunk = db.get(Chunk, cit.chunk_id)
    if not (version and document and chunk and acl.can_serve_version(db, user, version, document)):
        raise AppError("SOURCE_UNAVAILABLE", 410, message=SOURCE_WITHDRAWN_MESSAGE)
    return {**_source(db, user, chunk, version, document), "quote": cit.quote}  # đoạn hỗ trợ ý (FR-10.1)


@router.get("/chunks/{chunk_id}/source")
def chunk_source(chunk_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Mở thẻ kết quả Hub (bổ sung ngoài bảng PRD 11.2): cùng kiểm tra quyền như citation."""
    chunk = db.get(Chunk, chunk_id)
    version = db.get(DocumentVersion, chunk.version_id) if chunk else None
    document = db.get(Document, version.document_id) if version else None
    if not (chunk and version and document and acl.can_serve_version(db, user, version, document)):
        raise not_found()
    return _source(db, user, chunk, version, document)


MAX_PAGES_PER_CALL = 10


def _merge_page(chunks: list[Chunk]) -> str:
    """Ghép các chunk cùng trang thành toàn văn trang, bỏ phần chồng lấn giữa hai chunk liên tiếp."""
    text = ""
    for c in chunks:
        if not text:
            text = c.text
            continue
        nxt = c.text
        cut = next((k for k in range(min(len(text), len(nxt), 600), 20, -1) if text.endswith(nxt[:k])), 0)
        text += ("" if cut else "\n") + nxt[cut:]
    return text


@router.get("/documents/{document_id}/versions/{version_id}/pages/{page}/image")
def page_image(
    document_id: str,
    version_id: str,
    page: int,
    width: int = Query(1000, ge=400, le=1600),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    version = db.get(DocumentVersion, version_id)
    document = db.get(Document, document_id)
    if not (version and document and version.document_id == document.id):
        raise not_found()
    if not (acl.can_read_course(db, user, document.course_id) and acl.role_can_see_version(user, version)):
        raise not_found()
    if not acl.can_serve_version(db, user, version, document):
        raise AppError("SOURCE_UNAVAILABLE", 410, message=SOURCE_WITHDRAWN_MESSAGE)
    if version.file_type != "pdf":
        raise AppError("PAGE_IMAGE_UNSUPPORTED", 409)
    try:
        image = page_render.render_png(version.storage_key, page, width)
    except page_render.PageOutOfRangeError as e:
        raise not_found() from e
    except Exception as e:
        raise AppError("PAGE_RENDER_FAILED", 502, retryable=True) from e
    return Response(image, media_type="image/png", headers={"Cache-Control": "private, no-store"})


@router.get("/documents/{document_id}/versions/{version_id}/pages")
def version_pages(
    document_id: str,
    version_id: str,
    page_from: int,
    page_to: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Đọc toàn văn theo trang quanh vị trí trích dẫn (UI-06 kiểu NotebookLM; bổ sung ngoài bảng PRD 11.2).

    Chỉ bản đang được phục vụ và đúng quyền (BR-01/03) — kiểm tra lại ở mỗi lần gọi, nguồn thu hồi → 410.
    """
    version = db.get(DocumentVersion, version_id)
    document = db.get(Document, document_id)
    if not (version and document and version.document_id == document.id):
        raise not_found()
    # Không có quyền môn/vai trò → 404 (không lộ sự tồn tại, BR-10); có quyền nhưng nguồn đã thu hồi/khóa → 410
    if not (acl.can_read_course(db, user, document.course_id) and acl.role_can_see_version(user, version)):
        raise not_found()
    if not acl.can_serve_version(db, user, version, document):
        raise AppError("SOURCE_UNAVAILABLE", 410, message=SOURCE_WITHDRAWN_MESSAGE)
    page_from = max(1, page_from)
    page_to = min(page_to, page_from + MAX_PAGES_PER_CALL - 1, version.page_count or page_to)
    chunks = db.scalars(
        select(Chunk)
        .where(Chunk.version_id == version.id, Chunk.locator_value >= page_from, Chunk.locator_value <= page_to)
        .order_by(Chunk.locator_value, Chunk.ordinal)
    )
    by_page: dict[int, list[Chunk]] = {}
    for c in chunks:
        by_page.setdefault(c.locator_value, []).append(c)
    loc_type = "slide" if version.file_type == "pptx" else "page"
    return {
        "document_id": document.id,
        "version_id": version.id,
        "title": document.title,
        "version_label": version.version_label,
        "page_count": version.page_count,
        "locator_type": loc_type,
        "page_from": page_from,
        "page_to": page_to,
        # trang không có chunk (mục lục/chỉ mục/trang trắng đã loại khi làm sạch) trả text rỗng để UI ghi rõ
        "pages": [{"page": p, "text": _merge_page(by_page.get(p, []))} for p in range(page_from, page_to + 1)],
    }


FEEDBACK_TYPES = (
    "helpful",
    "not_helpful",
    "knowledge_error",
    "missing_source",
    "wrong_citation",
    "wrong_scope",
    "ui_error",
    "other",
)


class FeedbackBody(BaseModel):
    type: str
    note: str | None = Field(None, max_length=2000)
    share_content: bool = False


@router.post("/answers/{answer_id}/feedback", status_code=201)
def feedback(
    answer_id: str, body: FeedbackBody, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    if body.type not in FEEDBACK_TYPES:
        raise bad_request("INVALID_FEEDBACK_TYPE")
    msg = db.get(Message, answer_id)
    if msg is None or msg.role != "assistant":
        raise not_found()
    conv: Conversation = get_owned(db, user, msg.conversation_id)  # người được xem câu trả lời
    question = None
    if body.share_content:  # FR-05.6: chỉ chia sẻ khi người dùng chủ động chọn; không chia sẻ toàn hội thoại
        question = db.scalar(
            select(Message.content).where(
                Message.conversation_id == conv.id, Message.request_id == msg.request_id, Message.role == "user"
            )
        )
    fb = Feedback(
        message_id=msg.id, reporter_id=user.id, course_id=message_course(msg, conv) or "", type=body.type, note=body.note,
        share_content=body.share_content, shared_question=question, shared_answer=msg.content if body.share_content else None,
    )  # fmt: skip
    db.add(fb)
    db.commit()
    return {"feedback_id": fb.id, "status": fb.status}
