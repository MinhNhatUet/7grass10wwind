from __future__ import annotations

from pathlib import Path

from src.ingestion.ocr.models import OCRResult


class OCRUnavailableError(RuntimeError):
    """Raised when OCR runtime is unavailable."""


class TextOCR:
    def recognize(self, image_path: str | Path) -> list[OCRResult]:
        raise OCRUnavailableError("OCR engine is not configured; native extraction result is preserved.")
