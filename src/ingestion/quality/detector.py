from __future__ import annotations

from src.ingestion.quality.flags import QualityFlag


def detect_page_quality(
    raw_text: str,
    element_count: int,
    image_count: int = 0,
    unsupported_count: int = 0,
    min_text_chars: int = 20,
) -> list[str]:
    flags: list[str] = []
    stripped = raw_text.strip()
    if not stripped:
        flags.append(QualityFlag.TEXT_EMPTY.value)
    elif len(stripped) < min_text_chars:
        flags.append(QualityFlag.TEXT_LOW_QUALITY.value)
    if image_count and not stripped:
        flags.extend([QualityFlag.POSSIBLE_SCAN.value, QualityFlag.OCR_REQUIRED.value])
    if image_count:
        flags.append(QualityFlag.VISUAL_CONTENT.value)
    if unsupported_count:
        flags.append(QualityFlag.UNSUPPORTED_OBJECT.value)
    if element_count == 0:
        flags.append(QualityFlag.PAGE_PARTIAL_EXTRACTION.value)
    return sorted(set(flags))
