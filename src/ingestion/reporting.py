from __future__ import annotations

from src.ingestion.chunking.structure import Chunk
from src.ingestion.models.page import PageIR


def corpus_summary(pages: list[PageIR], chunks: list[Chunk]) -> str:
    needs_review = sum(1 for page in pages if page.quality_flags)
    native_text_ok = sum(1 for page in pages if page.raw_text.strip())
    ocr_required = sum(1 for page in pages if "OCR_REQUIRED" in page.quality_flags)
    return "\n".join(
        [
            "Corpus ingestion report",
            "-----------------------",
            f"Pages / Slides          : {len(pages)}",
            f"Native text OK          : {native_text_ok}",
            f"OCR required            : {ocr_required}",
            f"Needs review            : {needs_review}",
            f"Chunks                  : {len(chunks)}",
        ]
    )
