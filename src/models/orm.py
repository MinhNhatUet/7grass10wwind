"""Mô hình dữ liệu nghiệp vụ (PRD 9.1, 9.2). ID dạng chuỗi có tiền tố để dễ truy vết."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db import Base


def now() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


# Trạng thái tài liệu (PRD 9.2)
DRAFT, PROCESSING, NEEDS_REVIEW, PENDING = "Draft", "Processing", "NeedsReview", "PendingApproval"
REJECTED, APPROVED, INDEXING, PUBLISHED = "Rejected", "Approved", "Indexing", "Published"
FAILED, WITHDRAWN, ARCHIVED = "Failed", "Withdrawn", "Archived"
VERSION_STATES = (DRAFT, PROCESSING, NEEDS_REVIEW, PENDING, REJECTED, APPROVED, INDEXING, PUBLISHED, FAILED)
VERSION_STATES += (WITHDRAWN, ARCHIVED)

ROLES = ("student", "lecturer", "reviewer", "admin")
# Nhãn liêm chính (IntegrityLabel, PRD 9.1): tài liệu tính điểm/đáp án không phục vụ Sinh viên (BR-06)
INTEGRITY_LABELS = ("learning_material", "exercise_ungraded", "exercise_graded", "answer_key")
RESTRICTED_FOR_STUDENTS = ("exercise_graded", "answer_key")


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("u"))
    login_id: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | locked
    password_hash: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    memberships: Mapped[list[Membership]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    code: Mapped[str | None] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(300))
    term: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="temporary")


class Membership(Base):
    """Quyền theo môn (PRD 9.1 Membership). Kiểm tra hiệu lực ở mỗi yêu cầu."""

    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "course_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    can_read: Mapped[bool] = mapped_column(Boolean, default=True)
    can_download: Mapped[bool] = mapped_column(Boolean, default=False)
    can_upload: Mapped[bool] = mapped_column(Boolean, default=False)
    can_review: Mapped[bool] = mapped_column(Boolean, default=False)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship(back_populates="memberships")


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("doc"))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(500))
    doc_type: Mapped[str] = mapped_column(String(50))  # textbook | slide | exercise | reference | other
    current_version_id: Mapped[str | None] = mapped_column(String(40))  # bản Published hiện hành
    emergency_locked: Mapped[bool] = mapped_column(Boolean, default=False)  # quản trị khóa khẩn cấp
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    versions: Mapped[list[DocumentVersion]] = relationship(back_populates="document")


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("ver"))
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    version_label: Mapped[str] = mapped_column(String(50))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    state: Mapped[str] = mapped_column(String(20), default=DRAFT, index=True)
    file_type: Mapped[str] = mapped_column(String(10))  # pdf | pptx
    original_filename: Mapped[str] = mapped_column(String(500))
    checksum: Mapped[str] = mapped_column(String(64), index=True)
    storage_key: Mapped[str] = mapped_column(String(200))
    size_bytes: Mapped[int] = mapped_column(Integer)
    page_count: Mapped[int | None] = mapped_column(Integer)
    authors: Mapped[str | None] = mapped_column(String(500))
    provenance: Mapped[str] = mapped_column(String(1000))
    usage_permission: Mapped[str] = mapped_column(String(50))  # confirmed | pending
    acl_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    download_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    integrity_label: Mapped[str] = mapped_column(String(30))
    chapter: Mapped[str | None] = mapped_column(String(200))
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    quality_warnings: Mapped[list[Any]] = mapped_column(JSON, default=list)
    reject_reason: Mapped[str | None] = mapped_column(Text)
    withdraw_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    document: Mapped[Document] = relationship(back_populates="versions")


class Chunk(Base):
    """Mọi chunk truy được về nguồn (PRD 9.1). Không ghép qua version/ACL (PRD 9.3)."""

    __tablename__ = "chunks"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("chk"))
    version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id", ondelete="CASCADE"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    locator_type: Mapped[str] = mapped_column(String(10))  # page | slide
    locator_value: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    extraction_quality: Mapped[str] = mapped_column(String(20), default="ok")
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary)
    # Chunk nhiều trang (nhập sẵn từ pipeline, D-49): [[vị trí ký tự bắt đầu, trang], …] tăng dần; None = cả chunk 1 trang
    page_map: Mapped[list[list[int]] | None] = mapped_column(JSON)

    def page_at(self, offset: int) -> int:
        """Trang chứa ký tự ở vị trí `offset` của text chunk (trích dẫn mở đúng trang, không phải trang đầu chunk)."""
        page = self.locator_value
        for start, p in self.page_map or []:
            if start > offset:
                break
            page = p
        return page


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("job"))
    version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # extract | index
    stage: Mapped[str] = mapped_column(String(30), default="queued")
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued | running | succeeded | failed
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error_code: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("apr"))
    version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id"), index=True)
    reviewed_revision: Mapped[int] = mapped_column(Integer)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(10))  # approve | reject
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditEvent(Base):
    """BR-11: actor, thời gian, đối tượng, lý do. Không có API sửa/xóa."""

    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str | None] = mapped_column(String(40), index=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    object_type: Mapped[str] = mapped_column(String(30))
    object_id: Mapped[str] = mapped_column(String(40), index=True)
    course_id: Mapped[str | None] = mapped_column(String(40), index=True)
    reason: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("conv"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    # D-28: None = router chọn môn theo từng câu hỏi (trong các môn được phép); môn đã chọn lưu ở message
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id"), nullable=True)
    assistant_mode: Mapped[str] = mapped_column(String(20), default="auto")
    document_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    title: Mapped[str] = mapped_column(String(300), default="Hội thoại mới")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("msg"))
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(10))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(30))
    assistant: Mapped[str | None] = mapped_column(String(20))
    request_id: Mapped[str | None] = mapped_column(String(40), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # thẻ Hub/kế hoạch/tự kiểm tra
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    citations: Mapped[list[Citation]] = relationship(order_by="Citation.ordinal")


class Citation(Base):
    """Nguồn nằm trong context thực sự dùng (PRD 9.1); ID ánh xạ nội bộ, không tin model (PRD 10.4)."""

    __tablename__ = "citations"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("cit"))
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    chunk_id: Mapped[str] = mapped_column(ForeignKey("chunks.id"))
    version_id: Mapped[str] = mapped_column(String(40), index=True)
    document_id: Mapped[str] = mapped_column(String(40))
    locator_type: Mapped[str] = mapped_column(String(10))
    locator_value: Mapped[int] = mapped_column(Integer)
    locator_end: Mapped[int | None] = mapped_column(Integer)  # D-50: trang cuối khi ý được hỗ trợ bởi nhiều trang liền
    quote: Mapped[str] = mapped_column(Text)
    source_revision: Mapped[int] = mapped_column(Integer)


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("fb"))
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id"), index=True)
    reporter_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    course_id: Mapped[str] = mapped_column(String(40), index=True)
    type: Mapped[str] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(Text)
    share_content: Mapped[bool] = mapped_column(Boolean, default=False)
    shared_question: Mapped[str | None] = mapped_column(Text)
    shared_answer: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="Open")  # Open | InProgress | Resolved
    assignee_id: Mapped[str | None] = mapped_column(String(40))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class StudyPlan(Base):
    """Lộ trình học (PRD 7.1.3.4): Draft → Confirmed → InProgress → Completed (+ Paused/Cancelled)."""

    __tablename__ = "study_plans"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("plan"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[str] = mapped_column(String(40))
    conversation_id: Mapped[str | None] = mapped_column(String(40))
    version: Mapped[int] = mapped_column(Integer, default=1)
    previous_id: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="Draft")
    goal: Mapped[str] = mapped_column(Text)
    days: Mapped[int] = mapped_column(Integer)
    minutes_per_day: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class IdempotencyRecord(Base):
    """PRD 11.4: cùng key + cùng hash → trả response cũ; khác hash → 409."""

    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("user_id", "endpoint", "key"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40))
    endpoint: Mapped[str] = mapped_column(String(200))
    key: Mapped[str] = mapped_column(String(200))
    request_hash: Mapped[str] = mapped_column(String(64))
    status_code: Mapped[int] = mapped_column(Integer)
    response: Mapped[Any] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class UsageEvent(Base):
    """Log vận hành tối thiểu (BL-25): không lưu nội dung câu hỏi, không secret."""

    __tablename__ = "usage_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    course_id: Mapped[str | None] = mapped_column(String(40), index=True)
    assistant: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(30))
    latency_ms: Mapped[float | None] = mapped_column(Float)
    request_id: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


# ---------------------------------------------------------------- Đề trắc nghiệm do giảng viên soạn (D-38, ngoài PRD 7.2)
QUIZ_KINDS = ("practice", "exam", "midterm", "final")  # chỉ "practice" được xem đáp án sau khi nộp (BR-06)
QUIZ_STATES = ("Draft", "Published", "Closed")


class CourseQuiz(Base):
    __tablename__ = "course_quizzes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("cq"))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(20), default="practice")
    time_limit_s: Mapped[int | None] = mapped_column(Integer)  # None = không giới hạn
    status: Mapped[str] = mapped_column(String(20), default="Draft")
    # [{"id","text","options":[4 chuỗi],"correct":0..3,"explanation"}] — đáp án KHÔNG bao giờ gửi cho SV trước khi nộp
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("qa"))
    quiz_id: Mapped[str] = mapped_column(ForeignKey("course_quizzes.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    answers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    score: Mapped[int | None] = mapped_column(Integer)
    total: Mapped[int | None] = mapped_column(Integer)
    late: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
