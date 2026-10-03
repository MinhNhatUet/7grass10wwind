"""Vòng đời tài liệu (BL-09…BL-14; FR-06, FR-08; PRD 9.2; BR-01, BR-07, BR-11).

Upload → Processing → Draft | NeedsReview → (submit) PendingApproval → (duyệt, khác uploader,
đúng revision) Approved → Indexing → Published. Từ chối cần lý do → Rejected. Thu hồi → Withdrawn,
có hiệu lực ngay vì retrieval/citation kiểm tra trạng thái tại thời điểm gọi.
Job chạy nền bằng thread riêng, có DB session riêng; lỗi giữ stage/error_code để retry (FR-07.1).
"""

from __future__ import annotations

import contextvars
import logging
import threading
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.config import get_settings
from src.db import get_sessionmaker
from src.models.orm import (
    APPROVED,
    ARCHIVED,
    DRAFT,
    FAILED,
    INDEXING,
    INTEGRITY_LABELS,
    NEEDS_REVIEW,
    PENDING,
    PROCESSING,
    PUBLISHED,
    REJECTED,
    ROLES,
    WITHDRAWN,
    Approval,
    Chunk,
    Document,
    DocumentVersion,
    IngestionJob,
    User,
)
from src.services import acl, audit, ingestion, storage
from src.services.errors import AppError, bad_request, conflict, forbidden, not_found

log = logging.getLogger(__name__)

EDITABLE_STATES = (DRAFT, NEEDS_REVIEW, REJECTED, PENDING)
DOC_TYPES = ("textbook", "slide", "exercise", "reference", "syllabus", "other")


@dataclass
class VersionMeta:
    title: str
    doc_type: str
    version_label: str
    provenance: str
    usage_permission: str  # confirmed | pending
    acl_roles: list[str]
    download_allowed: bool
    integrity_label: str
    authors: str | None = None
    chapter: str | None = None

    def validate(self) -> None:
        if not self.title.strip() or not self.version_label.strip() or not self.provenance.strip():
            raise bad_request("MISSING_METADATA", "Tiêu đề, phiên bản và nguồn gốc là bắt buộc")
        if self.doc_type not in DOC_TYPES:
            raise bad_request("INVALID_DOC_TYPE")
        if self.usage_permission not in ("confirmed", "pending"):
            raise bad_request("INVALID_USAGE_PERMISSION")
        if self.integrity_label not in INTEGRITY_LABELS:
            raise bad_request("INVALID_INTEGRITY_LABEL")
        if any(r not in ROLES or r == "admin" for r in self.acl_roles):
            raise bad_request("INVALID_ACL_ROLES")


# ---------------------------------------------------------------- upload + trích xuất


def upload(
    db: Session, user: User, course_id: str, content: bytes, filename: str, meta: VersionMeta, document_id: str | None
) -> tuple[DocumentVersion, IngestionJob]:
    if not acl.can_upload(db, user, course_id):
        raise forbidden("UPLOAD_NOT_ALLOWED")  # AC-06.1
    meta.validate()
    if len(content) > get_settings().upload_max_mb * 1024 * 1024:
        raise bad_request("FILE_TOO_LARGE")
    try:
        file_type = ingestion.detect_file_type(content)  # AC-06.2: không dựa đuôi file
    except ingestion.IngestionError as e:
        raise bad_request(e.code) from e

    checksum, key = storage.save_bytes(content)
    # FR-06.3: trùng checksum trong cùng môn (phạm vi người upload được biết) → báo, không gộp ACL
    dup = db.scalar(
        select(DocumentVersion)
        .join(Document)
        .where(Document.course_id == course_id, DocumentVersion.checksum == checksum)
        .where(DocumentVersion.state.not_in((WITHDRAWN, ARCHIVED)))
    )
    if dup is not None:
        raise AppError("DUPLICATE_FILE", 409, message=f"Tệp đã có trong môn (phiên bản {dup.id})")

    if document_id:
        document = db.get(Document, document_id)
        if document is None or document.course_id != course_id:
            raise not_found()
    else:
        document = Document(course_id=course_id, owner_id=user.id, title=meta.title.strip(), doc_type=meta.doc_type)
        db.add(document)
        db.flush()

    version = DocumentVersion(
        document_id=document.id,
        version_label=meta.version_label.strip(),
        state=PROCESSING,
        file_type=file_type,
        original_filename=filename[:500],
        checksum=checksum,
        storage_key=key,
        size_bytes=len(content),
        authors=meta.authors,
        provenance=meta.provenance.strip(),
        usage_permission=meta.usage_permission,
        acl_roles=sorted(set(meta.acl_roles)),
        download_allowed=meta.download_allowed,
        integrity_label=meta.integrity_label,
        chapter=meta.chapter,
        uploader_id=user.id,
    )
    db.add(version)
    db.flush()
    job = IngestionJob(version_id=version.id, kind="extract", stage="queued")
    db.add(job)
    audit.record(
        db, actor_id=user.id, action="upload", object_type="version", object_id=version.id, course_id=course_id
    )
    db.commit()
    start_job(job.id)
    return version, job


def import_prechunked(
    db: Session,
    user: User,
    course_id: str,
    content: bytes,
    filename: str,
    meta: VersionMeta,
    page_count: int,
    chunks: list[dict],
    source: str,
) -> DocumentVersion:
    """Nhập tài liệu ĐÃ được pipeline dữ liệu chunk sẵn (D-49): lưu tệp gốc (xem trang/tải về), KHÔNG trích xuất lại.

    Cùng kiểm tra như upload (quyền tải lên, metadata, loại tệp theo nội dung, trùng checksum, audit). Bản vào Draft
    kèm chunk {text, page, page_map}; sau đó vẫn phải gửi duyệt → người duyệt khác duyệt → index (embedding đúng các
    chunk này) → Published.
    """
    if not acl.can_upload(db, user, course_id):
        raise forbidden("UPLOAD_NOT_ALLOWED")
    meta.validate()
    if not chunks:
        raise bad_request("NO_CHUNKS")
    try:
        file_type = ingestion.detect_file_type(content)
    except ingestion.IngestionError as e:
        raise bad_request(e.code) from e
    checksum, key = storage.save_bytes(content)
    dup = db.scalar(
        select(DocumentVersion)
        .join(Document)
        .where(Document.course_id == course_id, DocumentVersion.checksum == checksum)
        .where(DocumentVersion.state.not_in((WITHDRAWN, ARCHIVED)))
    )
    if dup is not None:
        raise AppError("DUPLICATE_FILE", 409, message=f"Tệp đã có trong môn (phiên bản {dup.id})")
    document = Document(course_id=course_id, owner_id=user.id, title=meta.title.strip(), doc_type=meta.doc_type)
    db.add(document)
    db.flush()
    version = DocumentVersion(
        document_id=document.id, version_label=meta.version_label.strip(), state=DRAFT, file_type=file_type,
        original_filename=filename[:500], checksum=checksum, storage_key=key, size_bytes=len(content),
        authors=meta.authors, provenance=meta.provenance.strip(), usage_permission=meta.usage_permission,
        acl_roles=sorted(set(meta.acl_roles)), download_allowed=meta.download_allowed,
        integrity_label=meta.integrity_label, chapter=meta.chapter, uploader_id=user.id, page_count=page_count,
    )  # fmt: skip
    db.add(version)
    db.flush()
    for i, c in enumerate(chunks):
        db.add(
            Chunk(
                version_id=version.id, ordinal=i, locator_type="page", locator_value=int(c["page"]),
                section=c.get("section"), text=c["text"], page_map=c.get("page_map"),
            )
        )  # fmt: skip
    audit.record(
        db, actor_id=user.id, action="upload", object_type="version", object_id=version.id, course_id=course_id,
        detail={"prechunked": len(chunks), "source": source},
    )  # fmt: skip
    db.commit()
    return version


def reprocess(db: Session, user: User, version_id: str, reason: str) -> tuple[DocumentVersion, IngestionJob]:
    """Xử lý lại cùng tệp gốc bằng pipeline hiện tại (vd sau khi thêm bước làm sạch, D-29).

    Bản Published bất biến (BR-07): tạo VERSION MỚI cùng tệp/metadata, đi lại đủ luồng trích xuất → gửi duyệt →
    duyệt → index. Bản cũ vẫn phục vụ tới khi bản mới Published rồi chuyển Archived; citation cũ không tự
    chuyển sang bản mới (FR-08.4).
    """
    old, document = get_version(db, version_id)
    if not acl.can_upload(db, user, document.course_id):
        raise forbidden("UPLOAD_NOT_ALLOWED")
    if not reason.strip():
        raise bad_request("REASON_REQUIRED")
    version = DocumentVersion(
        document_id=document.id, version_label=old.version_label, state=PROCESSING, file_type=old.file_type,
        original_filename=old.original_filename, checksum=old.checksum, storage_key=old.storage_key,
        size_bytes=old.size_bytes, authors=old.authors, provenance=old.provenance,
        usage_permission=old.usage_permission, acl_roles=list(old.acl_roles), download_allowed=old.download_allowed,
        integrity_label=old.integrity_label, chapter=old.chapter, uploader_id=user.id,
    )  # fmt: skip
    db.add(version)
    db.flush()
    job = IngestionJob(version_id=version.id, kind="extract")
    db.add(job)
    audit.record(
        db, actor_id=user.id, action="reprocess", object_type="version", object_id=version.id,
        course_id=document.course_id, reason=reason, detail={"from_version": old.id},
    )  # fmt: skip
    db.commit()
    start_job(job.id)
    return version, job


def reprocess_prechunked(
    db: Session,
    user: User,
    version_id: str,
    reason: str,
    page_count: int,
    chunks: list[dict],
    source: str,
) -> DocumentVersion:
    """Create a safe draft revision from externally prepared chunks.

    The current Published version and its embeddings stay untouched.  The new
    revision must still pass submit -> approval -> index; only a successful
    index job swaps ``Document.current_version_id`` and archives the old
    Published version.
    """
    old, document = get_version(db, version_id)
    if not acl.can_upload(db, user, document.course_id):
        raise forbidden("UPLOAD_NOT_ALLOWED")
    if not reason.strip():
        raise bad_request("REASON_REQUIRED")
    if not source.strip():
        raise bad_request("SOURCE_REQUIRED")
    if page_count < 1:
        raise bad_request("INVALID_PAGE_COUNT")
    if not chunks:
        raise bad_request("NO_CHUNKS")

    prepared: list[dict] = []
    for item in chunks:
        text = str(item.get("text") or "").strip()
        try:
            page = int(item["page"])
        except (KeyError, TypeError, ValueError) as exc:
            raise bad_request("INVALID_CHUNK_LOCATOR") from exc
        if not text:
            raise bad_request("EMPTY_CHUNK")
        if page < 1 or page > page_count:
            raise bad_request("INVALID_CHUNK_LOCATOR")
        section = item.get("section")
        if section is not None:
            section = str(section).strip() or None
            if section and len(section) > 1000:
                raise bad_request("SECTION_TOO_LONG")
        page_map = item.get("page_map")
        if page_map is not None:
            try:
                page_map = [[int(offset), int(mapped_page)] for offset, mapped_page in page_map]
            except (TypeError, ValueError) as exc:
                raise bad_request("INVALID_PAGE_MAP") from exc
            if any(offset < 0 or mapped_page < 1 or mapped_page > page_count for offset, mapped_page in page_map):
                raise bad_request("INVALID_PAGE_MAP")
            if page_map != sorted(page_map, key=lambda pair: pair[0]):
                raise bad_request("INVALID_PAGE_MAP")
        prepared.append({"text": text, "page": page, "section": section, "page_map": page_map})

    version = DocumentVersion(
        document_id=document.id, version_label=old.version_label, state=DRAFT, file_type=old.file_type,
        original_filename=old.original_filename, checksum=old.checksum, storage_key=old.storage_key,
        size_bytes=old.size_bytes, page_count=page_count, authors=old.authors, provenance=old.provenance,
        usage_permission=old.usage_permission, acl_roles=list(old.acl_roles), download_allowed=old.download_allowed,
        integrity_label=old.integrity_label, chapter=old.chapter, uploader_id=user.id,
    )  # fmt: skip
    db.add(version)
    db.flush()
    for ordinal, item in enumerate(prepared):
        db.add(
            Chunk(
                version_id=version.id,
                ordinal=ordinal,
                locator_type="page",
                locator_value=item["page"],
                section=item["section"],
                text=item["text"],
                page_map=item["page_map"],
            )
        )
    audit.record(
        db, actor_id=user.id, action="reprocess_prechunked", object_type="version", object_id=version.id,
        course_id=document.course_id, reason=reason,
        detail={"from_version": old.id, "chunks": len(prepared), "source": source},
    )  # fmt: skip
    db.commit()
    return version


def _run_extract(db: Session, job: IngestionJob, version: DocumentVersion) -> None:
    content = storage.path_of(version.storage_key).read_bytes()
    try:
        ext = ingestion.extract(content)
    except ingestion.IngestionError as e:
        version.state = FAILED
        version.quality_warnings = [{"issue": e.code}]
        job.status, job.error_code = "failed", e.code
        return
    db.execute(delete(Chunk).where(Chunk.version_id == version.id))  # retry không tạo dữ liệu trùng (UAT-10)
    for i, c in enumerate(ext.chunks):
        db.add(
            Chunk(
                version_id=version.id,
                ordinal=i,
                locator_type=c.locator_type,
                locator_value=c.locator_value,
                text=c.text,
                extraction_quality=c.quality,
            )
        )
    version.page_count = ext.page_count
    version.quality_warnings = ext.warnings
    version.state = NEEDS_REVIEW if ingestion.needs_review(ext) else DRAFT
    job.status, job.stage, job.progress = "succeeded", "extracted", 1.0
    if ext.chunks and get_settings().embed_on_upload:
        # D-34: embedding sẵn ngay khi tải lên. Chỉ mục tạm KHÔNG tham gia tìm kiếm (retrieval chỉ lấy bản Published);
        # duyệt xong, job index chỉ còn phần thiếu nên phát hành gần như ngay (PRD 9.2, FR-08)
        db.add(IngestionJob(version_id=version.id, kind="embed"))
    document = db.get(Document, version.document_id)
    audit.record(
        db, actor_id=None, action="extract", object_type="version", object_id=version.id,
        course_id=document.course_id if document else None,
        detail={"chunks": len(ext.chunks), "cleaning": ext.cleaning},
    )  # fmt: skip


PRE_EMBED_STATES = (DRAFT, NEEDS_REVIEW, PENDING)


def _run_embed(db: Session, job: IngestionJob, version: DocumentVersion) -> None:
    """D-34: embedding trước duyệt. Không bao giờ đổi trạng thái bản/phát hành; lỗi (vd. hết quota) chỉ đánh dấu job —
    job index sau duyệt làm tiếp. Tự dừng khi bản đã rời trạng thái chờ duyệt."""
    from src.services.retrieval import chunk_embedding_text, embed_texts

    chunks = [c for c in db.scalars(select(Chunk).where(Chunk.version_id == version.id).order_by(Chunk.ordinal))]
    todo = [c for c in chunks if c.embedding is None]
    batch = get_settings().embedding_batch_size
    try:
        for i in range(0, len(todo), batch):
            db.refresh(version)
            if version.state not in PRE_EMBED_STATES:
                break
            part = todo[i : i + batch]
            for c, blob in zip(part, embed_texts([chunk_embedding_text(c) for c in part]), strict=True):
                c.embedding = blob
            job.progress = min(1.0, (len(chunks) - len(todo) + i + len(part)) / max(len(chunks), 1))
            db.commit()
    except Exception as e:  # noqa: BLE001 — lỗi provider: ghi lại, không chặn luồng duyệt
        log.warning("embed job %s lỗi: %s", job.id, type(e).__name__)
        job.status, job.error_code = "failed", f"EMBEDDING_{type(e).__name__}"[:100]
        return
    job.status, job.stage = "succeeded", "embedded"


def _run_index(db: Session, job: IngestionJob, version: DocumentVersion) -> None:
    version.state = INDEXING
    db.commit()
    chunks = list(db.scalars(select(Chunk).where(Chunk.version_id == version.id).order_by(Chunk.ordinal)))
    try:
        from src.services.retrieval import chunk_embedding_text, embed_texts

        todo = [c for c in chunks if c.embedding is None]
        done = len(chunks) - len(todo)
        job.stage = "embedding"
        job.progress = done / max(len(chunks), 1)
        db.commit()
        batch = get_settings().embedding_batch_size
        for i in range(0, len(todo), batch):
            part = todo[i : i + batch]
            for c, blob in zip(part, embed_texts([chunk_embedding_text(c) for c in part]), strict=True):
                c.embedding = blob
            job.progress = min(1.0, (done + i + len(part)) / max(len(chunks), 1))
            db.commit()
    except Exception as e:  # noqa: BLE001 — lỗi provider: giữ approval, Failed để retry (PRD 7.1.7.1)
        log.warning("index job %s lỗi: %s", job.id, type(e).__name__)
        version.state = FAILED
        from src.services.retrieval import _is_rate_limit

        job.status = "failed"
        job.error_code = "EMBEDDING_RATE_LIMITED" if _is_rate_limit(e) else "EMBEDDING_UNAVAILABLE"
        return
    job.stage = "publishing"
    db.commit()
    # Phát hành: chỉ sau approval đúng revision và index sẵn sàng (FR-08.3)
    approval = db.scalar(
        select(Approval)
        .where(Approval.version_id == version.id, Approval.decision == "approve")
        .order_by(Approval.created_at.desc())
    )
    if approval is None or approval.reviewed_revision != version.revision:
        version.state = FAILED
        job.status, job.error_code = "failed", "APPROVAL_REVISION_MISMATCH"
        return
    document = db.get(Document, version.document_id)
    previous = db.get(DocumentVersion, document.current_version_id) if document.current_version_id else None
    if previous is not None and previous.id != version.id and previous.state == PUBLISHED:
        previous.state = ARCHIVED  # thay phiên bản: bản cũ lưu trữ, không phục vụ
    document.current_version_id = version.id
    version.state = PUBLISHED
    version.published_at = datetime.now(UTC)
    job.status, job.stage, job.progress = "succeeded", "published", 1.0
    audit.record(
        db, actor_id=None, action="publish", object_type="version", object_id=version.id, course_id=document.course_id
    )


def _run_job(job_id: str) -> None:
    db = get_sessionmaker()()
    try:
        job = db.get(IngestionJob, job_id)
        if job is None:
            return
        version = db.get(DocumentVersion, job.version_id)
        job.status, job.attempts, job.stage = "running", job.attempts + 1, job.kind
        db.commit()
        if job.kind == "extract":
            _run_extract(db, job, version)
        elif job.kind == "embed":
            _run_embed(db, job, version)
        elif job.kind == "index":
            _run_index(db, job, version)
        else:  # loại job không hỗ trợ: KHÔNG được rơi vào index/phát hành (BR-01)
            job.status, job.error_code = "failed", f"UNSUPPORTED_JOB_{job.kind}"[:100]
        db.commit()
        for pending in db.scalars(
            select(IngestionJob).where(
                IngestionJob.version_id == version.id, IngestionJob.kind == "embed", IngestionJob.status == "queued"
            )
        ):
            start_job(pending.id)
    except Exception as e:  # noqa: BLE001 — job không được làm sập tiến trình
        db.rollback()
        log.exception("job %s lỗi", job_id)
        job = db.get(IngestionJob, job_id)
        if job is not None:
            job.status, job.error_code = "failed", f"INTERNAL_{type(e).__name__}"[:100]
            version = db.get(DocumentVersion, job.version_id)
            if version is not None and version.state in (PROCESSING, INDEXING):
                version.state = FAILED
            db.commit()
    finally:
        db.close()


def start_job(job_id: str) -> None:
    # thread không tự mang context của request → sao chép để log của job giữ http_request_id đã khởi tạo nó
    ctx = contextvars.copy_context()
    threading.Thread(target=ctx.run, args=(_run_job, job_id), daemon=True, name=f"job-{job_id}").start()


def resume_interrupted_jobs() -> None:
    """Khi khởi động lại: job đang chạy dở được chạy lại (idempotent, xóa chunk cũ trước khi ghi)."""
    db = get_sessionmaker()()
    try:
        ids = list(db.scalars(select(IngestionJob.id).where(IngestionJob.status.in_(("queued", "running")))))
    finally:
        db.close()
    for job_id in ids:
        start_job(job_id)


def retry(db: Session, user: User, version_id: str) -> IngestionJob:
    version, document = get_version(db, version_id)
    if not (acl.can_upload(db, user, document.course_id) or acl.can_review(db, user, document.course_id)):
        raise forbidden()
    if version.state != FAILED:
        raise conflict("NOT_FAILED")
    approved = db.scalar(select(Approval).where(Approval.version_id == version.id, Approval.decision == "approve"))
    kind = "index" if approved and approved.reviewed_revision == version.revision else "extract"
    version.state = APPROVED if kind == "index" else PROCESSING
    job = IngestionJob(version_id=version.id, kind=kind)
    db.add(job)
    audit.record(db, actor_id=user.id, action=f"retry_{kind}", object_type="version", object_id=version.id)
    db.commit()
    start_job(job.id)
    return job


# ---------------------------------------------------------------- truy vấn


def get_version(db: Session, version_id: str) -> tuple[DocumentVersion, Document]:
    version = db.get(DocumentVersion, version_id)
    if version is None:
        raise not_found()
    return version, db.get(Document, version.document_id)


def can_manage_version(db: Session, user: User, document: Document) -> bool:
    return acl.can_upload(db, user, document.course_id)


def can_preview(db: Session, user: User, document: Document) -> bool:
    """Preview bản chưa Published chỉ cho người quản lý/duyệt môn (FR-07.5)."""
    return acl.can_upload(db, user, document.course_id) or acl.can_review(db, user, document.course_id)


# ---------------------------------------------------------------- sửa, gửi duyệt, quyết định, thu hồi


def update_metadata(
    db: Session, user: User, version_id: str, meta: VersionMeta, expected_revision: int
) -> DocumentVersion:
    version, document = get_version(db, version_id)
    if not can_manage_version(db, user, document):
        raise not_found()
    if version.state not in EDITABLE_STATES:
        raise conflict("VERSION_IMMUTABLE")  # BR-07: bản Published bất biến → tạo version mới
    if version.revision != expected_revision:
        raise conflict("REVISION_CONFLICT")
    meta.validate()
    version.version_label, version.provenance = meta.version_label.strip(), meta.provenance.strip()
    version.usage_permission, version.acl_roles = meta.usage_permission, sorted(set(meta.acl_roles))
    version.download_allowed, version.integrity_label = meta.download_allowed, meta.integrity_label
    version.authors, version.chapter = meta.authors, meta.chapter
    if document.current_version_id is None:
        document.title, document.doc_type = meta.title.strip(), meta.doc_type
    version.revision += 1  # FR-06.5: sửa làm tăng revision, cần kiểm tra lại
    if version.state == PENDING:
        version.state = DRAFT
    audit.record(
        db, actor_id=user.id, action="edit_metadata", object_type="version", object_id=version.id,
        course_id=document.course_id, detail={"revision": version.revision},
    )  # fmt: skip
    db.commit()
    return version


def submit(db: Session, user: User, version_id: str, acknowledge_warnings: bool) -> DocumentVersion:
    version, document = get_version(db, version_id)
    if not can_manage_version(db, user, document):
        raise not_found()
    if version.state not in (DRAFT, NEEDS_REVIEW, REJECTED):
        raise conflict("INVALID_STATE")
    if version.state == NEEDS_REVIEW and not acknowledge_warnings:
        raise bad_request("QUALITY_WARNINGS_NOT_ACKNOWLEDGED")
    if not db.scalar(select(Chunk.id).where(Chunk.version_id == version.id).limit(1)):
        raise bad_request("NO_EXTRACTED_TEXT")  # FR-07.6: không hợp thức hóa nội dung không đọc được
    if version.usage_permission != "confirmed":
        raise bad_request("USAGE_PERMISSION_NOT_CONFIRMED")  # FR-06: chưa xác nhận quyền → giữ nháp
    if not version.acl_roles:
        raise bad_request("MISSING_ACL")
    version.state = PENDING
    version.reject_reason = None
    audit.record(
        db, actor_id=user.id, action="submit", object_type="version", object_id=version.id,
        course_id=document.course_id, detail={"revision": version.revision},
    )  # fmt: skip
    db.commit()
    return version


def decide(
    db: Session, user: User, version_id: str, decision: str, reason: str | None, reviewed_revision: int
) -> tuple[DocumentVersion, IngestionJob | None]:
    version, document = get_version(db, version_id)
    if not acl.can_review(db, user, document.course_id):
        raise forbidden("REVIEW_NOT_ASSIGNED")  # AC-08.1
    if version.uploader_id == user.id:
        raise forbidden("SELF_APPROVAL_NOT_ALLOWED")  # UAT-09: uploader != approver
    if version.state != PENDING:
        raise conflict("INVALID_STATE")
    if version.revision != reviewed_revision:
        raise conflict("REVISION_CONFLICT")  # FR-08.2, UAT-14
    if decision not in ("approve", "reject"):
        raise bad_request("INVALID_DECISION")
    if decision == "reject" and not (reason and reason.strip()):
        raise bad_request("REASON_REQUIRED")
    db.add(
        Approval(
            version_id=version.id,
            reviewed_revision=reviewed_revision,
            reviewer_id=user.id,
            decision=decision,
            reason=reason,
        )
    )
    job = None
    if decision == "reject":
        version.state, version.reject_reason = REJECTED, reason
    else:
        version.state = APPROVED
        job = IngestionJob(version_id=version.id, kind="index")
        db.add(job)
    audit.record(
        db, actor_id=user.id, action=decision, object_type="version", object_id=version.id,
        course_id=document.course_id, reason=reason, detail={"revision": reviewed_revision},
    )  # fmt: skip
    db.commit()
    if job:
        start_job(job.id)
    return version, job


def withdraw(
    db: Session, user: User, version_id: str, reason: str, replacement_version_id: str | None
) -> DocumentVersion:
    version, document = get_version(db, version_id)
    if not acl.can_review(db, user, document.course_id):
        raise forbidden("WITHDRAW_NOT_ALLOWED")  # PRD 5.1: GV thường chỉ đề nghị thu hồi
    if not reason or not reason.strip():
        raise bad_request("REASON_REQUIRED")
    if version.state not in (PUBLISHED, APPROVED, INDEXING, PENDING, FAILED):
        raise conflict("INVALID_STATE")
    version.state, version.withdraw_reason = WITHDRAWN, reason
    if document.current_version_id == version.id:
        # PRD 11.2: không có replacement → published_version = NULL, không tự fallback
        document.current_version_id = None
        if replacement_version_id:
            rep = db.get(DocumentVersion, replacement_version_id)
            if rep is None or rep.document_id != document.id or rep.state not in (PUBLISHED, ARCHIVED):
                raise bad_request("INVALID_REPLACEMENT")
            rep.state = PUBLISHED
            document.current_version_id = rep.id
    audit.record(
        db, actor_id=user.id, action="withdraw", object_type="version", object_id=version.id,
        course_id=document.course_id, reason=reason, detail={"replacement_version_id": replacement_version_id},
    )  # fmt: skip
    db.commit()
    return version


def emergency_lock(db: Session, admin: User, document_id: str, locked: bool, reason: str) -> Document:
    """Quản trị khóa khẩn cấp khi có sự cố, lưu audit; không dùng để công bố nguồn (FR-08.5)."""
    if admin.role != "admin":
        raise forbidden()
    if not reason.strip():
        raise bad_request("REASON_REQUIRED")
    document = db.get(Document, document_id)
    if document is None:
        raise not_found()
    document.emergency_locked = locked
    audit.record(
        db, actor_id=admin.id, action="emergency_lock" if locked else "emergency_unlock", object_type="document",
        object_id=document.id, course_id=document.course_id, reason=reason,
    )  # fmt: skip
    db.commit()
    return document
