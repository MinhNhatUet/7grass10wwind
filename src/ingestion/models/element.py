from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field, field_validator


class ElementType(StrEnum):
    TITLE = "title"
    TEXT = "text"
    LIST = "list"
    FORMULA = "formula"
    IMAGE = "image"
    FIGURE = "figure"
    TABLE = "table"
    CHART = "chart"
    CAPTION = "caption"


class Element(BaseModel):
    id: str
    type: ElementType
    bbox: list[float] | None = None
    order: int
    heading_level: int | None = Field(default=None, ge=1)
    source: str = "native"
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    coordinate_system: str = "source_native"
    text: str | None = None
    image_path: str | None = None
    latex: str | None = None
    page_number: int | None = None
    native_text: str | None = None
    native_font: str | None = None
    native_font_size: float | None = None
    native_quality: float | None = None
    crop_path: str | None = None
    recognition_method: str | None = None
    model_name: str | None = None
    verified: bool = False
    needs_review: bool = False
    recognition_error: str | None = None
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    caption: str | None = None
    nearby_text: str | None = None
    machine_description: str | None = None
    machine_description_verified: bool = False
    quality_flags: list[str] = Field(default_factory=list)

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, value: list[float] | None) -> list[float] | None:
        if value is not None and len(value) != 4:
            raise ValueError("bbox must be [x0, y0, x1, y1]")
        return value
