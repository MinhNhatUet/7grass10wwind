from __future__ import annotations

from pydantic import BaseModel, Field

from src.ingestion.models.document import Document, DocumentACL, DocumentVersion, IntegrityLabel


class MetadataSuggestion(BaseModel):
    value: str
    source: str
    confirmed: bool = False


class ResolvedMetadata(BaseModel):
    document: Document
    version: DocumentVersion
    acl: DocumentACL
    integrity: IntegrityLabel
    metadata_status: str
    missing_required_fields: list[str] = Field(default_factory=list)
    metadata_warnings: list[str] = Field(default_factory=list)
    suggestions: dict[str, MetadataSuggestion] = Field(default_factory=dict)
