from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class IngestionStage(StrEnum):
    VALIDATE = "validate"
    EXTRACT = "extract"
    OCR = "ocr"
    FORMULA = "formula"
    TABLE = "table"
    QUALITY = "quality"
    CHUNK = "chunk"
    EMBED = "embed"
    INDEX = "index"


class IngestionJob(BaseModel):
    id: str
    version_id: str
    stage: IngestionStage
    status: str
    attempts: int = Field(default=1, ge=1)
    error_code: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
