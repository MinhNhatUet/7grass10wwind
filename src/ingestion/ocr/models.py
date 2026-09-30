from __future__ import annotations

from pydantic import BaseModel


class OCRResult(BaseModel):
    text: str
    bbox: list[float] | None = None
    confidence: float | None = None
    source: str = "ocr"
