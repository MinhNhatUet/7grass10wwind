from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field, field_validator


class DocumentState(StrEnum):
    DRAFT = "Draft"
    PROCESSING = "Processing"
    NEEDS_REVIEW = "NeedsReview"
    PENDING_APPROVAL = "PendingApproval"
    APPROVED = "Approved"
    INDEXING = "Indexing"
    PUBLISHED = "Published"
    REJECTED = "Rejected"
    FAILED = "Failed"
    WITHDRAWN = "Withdrawn"
    ARCHIVED = "Archived"


class SourceInfo(BaseModel):
    origin: str | None = None
    provider: str | None = None
    received_at: str | None = None


class RightsInfo(BaseModel):
    usage_status: str = "unknown"
    ai_processing_allowed: bool = False
    note: str | None = None


class AcademicInfo(BaseModel):
    semester: str | None = None
    chapter: list[str] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    effective_from: str | None = None
    effective_to: str | None = None


class Course(BaseModel):
    id: str
    code: str
    name: str
    term: str | None = None
    status: str = "active"


class Document(BaseModel):
    id: str
    course_id: str
    owner_id: str | None = None
    title: str
    current_version_id: str | None = None
    document_type: str | None = None
    author: str | None = None
    provider: str | None = None
    language: str | None = None
    academic: AcademicInfo = Field(default_factory=AcademicInfo)


class DocumentVersion(BaseModel):
    id: str
    document_id: str
    version: str = "1.0"
    checksum: str
    storage_key: str
    state: DocumentState = DocumentState.PROCESSING
    revision: int = Field(default=1, ge=1)
    filename: str
    mime_type: str
    size_bytes: int
    source: SourceInfo = Field(default_factory=SourceInfo)
    rights: RightsInfo = Field(default_factory=RightsInfo)
    ingestion_config_version: str = "ingestion_v1"

    @property
    def production_retrieval_eligible(self) -> bool:
        return self.state == DocumentState.PUBLISHED


class DocumentACL(BaseModel):
    version_id: str
    allowed_roles: list[str] = Field(default_factory=list)
    allowed_groups: list[str] = Field(default_factory=list)
    download_allowed: bool = False

    @property
    def is_valid_for_serving(self) -> bool:
        return bool(self.allowed_roles or self.allowed_groups)


class EffectivePeriod(BaseModel):
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None


class IntegrityLabel(BaseModel):
    version_id: str
    type: str
    assessment_id: str | None = None
    effective_period: EffectivePeriod = Field(default_factory=EffectivePeriod)
    assigned_by: str | None = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        valid = {
            "learning_material",
            "practice",
            "graded_assignment",
            "exam",
            "solution",
            "answer_key",
            "restricted",
        }
        if value not in valid:
            raise ValueError(f"Unsupported integrity label: {value}")
        return value
