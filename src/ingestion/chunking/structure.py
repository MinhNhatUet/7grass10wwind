from __future__ import annotations

from pydantic import BaseModel, Field

from src.ingestion.models.page import Locator


class Chunk(BaseModel):
    id: str
    document_id: str
    version_id: str
    course_id: str
    document_type: str | None = None
    title: str
    section: str | None = None
    locator: Locator
    text: str
    element_ids: list[str] = Field(default_factory=list)
    element_types: list[str] = Field(default_factory=list)
    extraction_method: str
    extraction_quality: float | None = None
    quality_flags: list[str] = Field(default_factory=list)
    source_revision: int
