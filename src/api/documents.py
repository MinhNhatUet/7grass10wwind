"""API tài liệu, duyệt, phát hành, thu hồi (PRD 11.2; FR-04, FR-06, FR-07, FR-08)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.deps import Idempotency, current_user, idempotency_key
from src.db import get_db
from src.models.orm import Approval, Chunk, Document, DocumentVersion, IngestionJob, User
from src.services import acl, documents, storage
from src.services.errors import AppError, bad_request, not_found
from src.services.retrieval import servable_versions

router = APIRouter()


def _iso(dt: Any) -> str | None:
    return dt.isoformat(timespec="seconds") if dt else None


def version_view(v: DocumentVersion, d: Document, *, full: bool) -> dict[str, Any]:
    base = {
        "document_id": d.id,
        "version_id": v.id,
        "course_id": d.course_id,
        "title": d.title,
        "doc_type": d.doc_type,
        "version_label": v.version_label,
        "chapter": v.chapter,
        "file_type": v.file_type,
        "page_count": v.page_count,
        "state": v.state,
        "published_at": _iso(v.published_at),
    }
    if full:  # chỉ cho người quản lý/duyệt môn
        base |= {
            "revision": v.revision,
            "authors": v.authors,
            "provenance": v.provenance,
            "usage_permission": v.usage_permission,
            "acl_roles": v.acl_roles,
            "download_allowed": v.download_allowed,
            "integrity_label": v.integrity_label,
            "uploader_id": v.uploader_id,
            "original_filename": v.original_filename,
            "size_bytes": v.size_bytes,
            "quality_warnings": v.quality_warnings,
            "reject_reason": v.reject_reason,
            "withdraw_reason": v.withdraw_reason,
            "is_current": d.current_version_id == v.id,
            "emergency_locked": d.emergency_locked,
            "created_at": _iso(v.created_at),
            "updated_at": _iso(v.updated_at),
        }
    return base


# ---------------------------------------------------------------- Hub (khám phá tài liệu, KHÔNG phải RAG)


@router.get("/documents")
def list_documents(
    course_id: str,
    doc_type: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Flow: Filter → Auth → Candidate → Count → Paginate; count chỉ trên tập đúng quyền (AC-04.1/04.2)."""
    rows = servable_versions(db, user, course_id)  # rỗng nếu không có quyền môn → không lộ gì
    items = [version_view(v, d, full=False) for v, d in rows]
    if doc_type:
        items = [i for i in items if i["doc_type"] == doc_type]
    if q:
        items = [i for i in items if q.casefold() in i["title"].casefold()]
    for i in items:
        v = db.get(DocumentVersion, i["version_id"])
        i["can_download"] = acl.can_download_version(db, user, v, db.get(Document, i["document_id"]))
    items.sort(key=lambda i: i["title"].casefold())
    total = len(items)
    start = (page - 1) * page_size
    return {"items": items[start : start + page_size], "total": total, "page": page, "page_size": page_size}


@router.get("/documents/{document_id}/versions/{version_id}/download")
def download(
    document_id: str, version_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> FileResponse:
    """Original download requires current source access AND download permission."""
    version, document = documents.get_version(db, version_id)
    if document.id != document_id or not acl.can_download_version(db, user, version, document):
        raise not_found()
    media = (
        "application/pdf"
        if version.file_type == "pdf"
        else "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    path = storage.path_of(version.storage_key)
    if not path.exists() and path.with_suffix(".pdf").exists():
        path = path.with_suffix(".pdf")
        
    return FileResponse(
        path, 
        media_type=media, 
        filename=version.original_filename,
        content_disposition_type="inline"
    )


def processing_views(db: Session, version_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Batch counts and latest job; only called after management authorization."""
    if not version_ids:
        return {}
    result = {vid: {"chunk_count": 0, "embedded_count": 0, "job": None} for vid in version_ids}
    for vid, total, done in db.execute(
        select(Chunk.version_id, func.count(Chunk.id), func.count(Chunk.embedding))
        .where(Chunk.version_id.in_(version_ids)).group_by(Chunk.version_id)
    ):
        result[vid].update(chunk_count=total, embedded_count=done)
    jobs = db.scalars(select(IngestionJob).where(IngestionJob.version_id.in_(version_ids))
                      .order_by(IngestionJob.created_at.desc(), IngestionJob.id.desc()))
    for job in jobs:
        if result[job.version_id]["job"] is None:
            result[job.version_id]["job"] = {
                "id": job.id, "kind": job.kind, "stage": job.stage, "status": job.status,
                "progress": job.progress, "error_code": job.error_code, "attempts": job.attempts,
            }
    return result


# ---------------------------------------------------------------- upload + quản lý (Giảng viên)


def _meta(raw: str) -> documents.VersionMeta:
    try:
        data = json.loads(raw)
        return documents.VersionMeta(
            title=str(data.get("title", "")),
            doc_type=str(data.get("doc_type", "")),
            version_label=str(data.get("version_label", "")),
            provenance=str(data.get("provenance", "")),
            usage_permission=str(data.get("usage_permission", "pending")),
            acl_roles=[str(r) for r in data.get("acl_roles", [])],
            download_allowed=bool(data.get("download_allowed", False)),
            integrity_label=str(data.get("integrity_label", "")),
            authors=data.get("authors") or None,
            chapter=data.get("chapter") or None,
        )
    except (json.JSONDecodeError, AttributeError) as e:
        raise bad_request("INVALID_METADATA") from e


async def _upload(
    course_id: str, document_id: str | None, file: UploadFile, metadata: str, key: str | None, user: User, db: Session
) -> dict[str, Any]:
    content = await file.read()
    idem = Idempotency(
        db,
        user,
        f"upload:{document_id or course_id}",
        key,
        {"sha": hashlib.sha256(content).hexdigest(), "meta": metadata},
    )
    if (replayed := idem.replay()) is not None:
        return replayed
    version, job = documents.upload(
        db, user, course_id, content, file.filename or "upload", _meta(metadata), document_id
    )
    resp = {"document_id": version.document_id, "version_id": version.id, "state": version.state, "job_id": job.id}
    idem.store(resp, 201)
    db.commit()
    return resp


@router.post("/documents", status_code=201)
async def create_document(
    course_id: str = Form(...),
    metadata: str = Form(
        ...,
        description="JSON: title, doc_type, version_label, provenance, usage_permission, acl_roles, download_allowed, integrity_label, authors?, chapter?",
    ),
    file: UploadFile = File(...),
    key: str | None = Depends(idempotency_key),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return await _upload(course_id, None, file, metadata, key, user, db)


@router.post("/documents/{document_id}/versions", status_code=201)
async def create_version(
    document_id: str,
    metadata: str = Form(...),
    file: UploadFile = File(...),
    key: str | None = Depends(idempotency_key),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    document = db.get(Document, document_id)
    if document is None:
        raise not_found()
    return await _upload(document.course_id, document_id, file, metadata, key, user, db)


@router.get("/manage/versions")
def manage_versions(
    course_id: str,
    state: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """UI-07/UI-09 (bổ sung ngoài bảng PRD 11.2): chỉ môn được quản lý/duyệt (AC-12.1)."""
    if not acl.can_manage_course(db, user, course_id):
        raise AppError("FORBIDDEN", 403)
    stmt = (
        select(DocumentVersion, Document)
        .join(Document)
        .where(Document.course_id == course_id)
        .order_by(DocumentVersion.updated_at.desc())
    )
    if state:
        stmt = stmt.where(DocumentVersion.state == state)
    rows = db.execute(stmt).all()
    progress = processing_views(db, [v.id for v, _ in rows])
    return {"items": [version_view(v, d, full=True) | progress[v.id] for v, d in rows]}


@router.get("/jobs/{job_id}")
def job_status(job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    job = db.get(IngestionJob, job_id)
    if job is None:
        raise not_found()
    version, document = documents.get_version(db, job.version_id)
    if not documents.can_preview(db, user, document):
        raise not_found()
    return {
        "id": job.id, "version_id": job.version_id, "kind": job.kind, "stage": job.stage, "status": job.status,
        "attempts": job.attempts, "progress": job.progress, "error_code": job.error_code, "version_state": version.state,
    }  # fmt: skip


@router.get("/review/versions/{version_id}/preview")
def preview(
    version_id: str,
    page_from: int = Query(1, ge=1),
    page_to: int | None = Query(None, ge=1),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """FR-07.5: text theo trang/slide + metadata/ACL/cảnh báo; SV không mở được bản chưa Published."""
    version, document = documents.get_version(db, version_id)
    if not documents.can_preview(db, user, document):
        raise not_found()
    page_to = page_to or page_from + 19
    chunks = db.scalars(
        select(Chunk)
        .where(Chunk.version_id == version.id, Chunk.locator_value >= page_from, Chunk.locator_value <= page_to)
        .order_by(Chunk.ordinal)
    )
    pages: dict[int, dict[str, Any]] = {}
    for c in chunks:
        p = pages.setdefault(
            c.locator_value,
            {
                "locator": {"type": c.locator_type, "value": c.locator_value},
                "text": "",
                "quality": c.extraction_quality,
            },
        )
        p["text"] += ("\n" if p["text"] else "") + c.text
    approvals = db.scalars(select(Approval).where(Approval.version_id == version.id).order_by(Approval.created_at))
    return {
        "version": version_view(version, document, full=True) | processing_views(db, [version.id])[version.id],
        "pages": [pages[k] for k in sorted(pages)],
        "page_from": page_from,
        "page_to": page_to,
        "approvals": [
            {
                "decision": a.decision,
                "reason": a.reason,
                "reviewer_id": a.reviewer_id,
                "reviewed_revision": a.reviewed_revision,
                "created_at": _iso(a.created_at),
            }
            for a in approvals
        ],
        "can_decide": acl.can_review(db, user, document.course_id) and version.uploader_id != user.id,
        "can_edit": documents.can_manage_version(db, user, document),
    }


@router.get("/review/versions/{version_id}/original")
def preview_original(
    version_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> FileResponse:
    """Bản gốc cho người quản lý/duyệt khi xem trước (bổ sung, FR-07.5)."""
    version, document = documents.get_version(db, version_id)
    if not documents.can_preview(db, user, document):
        raise not_found()
    media = "application/pdf" if version.file_type == "pdf" else "application/octet-stream"
    return FileResponse(
        storage.path_of(version.storage_key),
        media_type=media,
        filename=version.original_filename,
        content_disposition_type="inline",
    )


class MetadataUpdate(BaseModel):
    expected_revision: int
    metadata: dict[str, Any]


@router.patch("/versions/{version_id}")
def edit_metadata(
    version_id: str, body: MetadataUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    version = documents.update_metadata(db, user, version_id, _meta(json.dumps(body.metadata)), body.expected_revision)
    return version_view(version, db.get(Document, version.document_id), full=True)


class SubmitBody(BaseModel):
    acknowledge_warnings: bool = False


@router.post("/versions/{version_id}/submit")
def submit(
    version_id: str, body: SubmitBody, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    version = documents.submit(db, user, version_id, body.acknowledge_warnings)
    return {"version_id": version.id, "state": version.state, "revision": version.revision}


class DecisionBody(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    reason: str | None = None
    reviewed_revision: int


@router.post("/versions/{version_id}/decision")
def decision(
    version_id: str,
    body: DecisionBody,
    key: str | None = Depends(idempotency_key),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    idem = Idempotency(db, user, f"decision:{version_id}", key, body.model_dump())
    if (replayed := idem.replay()) is not None:
        return replayed
    version, job = documents.decide(db, user, version_id, body.decision, body.reason, body.reviewed_revision)
    resp = {"version_id": version.id, "state": version.state, "job_id": job.id if job else None}
    idem.store(resp)
    db.commit()
    return resp


class WithdrawBody(BaseModel):
    reason: str
    replacement_version_id: str | None = None


@router.post("/versions/{version_id}/withdraw")
def withdraw(
    version_id: str, body: WithdrawBody, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    version = documents.withdraw(db, user, version_id, body.reason, body.replacement_version_id)
    return {"version_id": version.id, "state": version.state}


@router.post("/versions/{version_id}/retry")
def retry(version_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Retry kỹ thuật giai đoạn lỗi (FR-07.1, UAT-10) — bổ sung ngoài bảng PRD 11.2."""
    job = documents.retry(db, user, version_id)
    return {"job_id": job.id, "kind": job.kind}
