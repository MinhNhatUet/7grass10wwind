from __future__ import annotations

from pydantic import BaseModel, Field

from src.ingestion.models.element import Element


class Locator(BaseModel):
    type: str
    number: int | None = None
    start: int | None = None
    end: int | None = None


class PageIR(BaseModel):
    id: str
    version_id: str
    locator: Locator
    width: float | None = None
    height: float | None = None
    raw_text: str = ""
    elements: list[Element] = Field(default_factory=list)
    extraction_method: str
    quality_score: float | None = None
    quality_flags: list[str] = Field(default_factory=list)


class ParsedDocument(BaseModel):
    version_id: str
    pages: list[PageIR]
    native_result: list[PageIR] = Field(default_factory=list)
    ocr_result: list[PageIR] = Field(default_factory=list)
    selected_result: list[PageIR] = Field(default_factory=list)
