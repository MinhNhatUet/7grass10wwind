"""Trích xuất PDF/PPTX và chia chunk (BL-10; FR-06.2, FR-07.2–07.4; PRD 9.3, 10.2).

- Loại file xác định bằng nội dung (magic bytes), không dựa đuôi file (FR-06.2).
- Mỗi chunk nằm trọn trong một trang/slide để locator luôn đúng; trang dài được chia nhỏ có chồng lấn.
- Trang/slide rỗng hoặc gần rỗng được đánh dấu theo vị trí, không điền nội dung suy đoán (FR-07.4).
- Không OCR (Should BL-33): PDF scan sẽ vào NeedsReview.
- Text được làm sạch theo từng trang trước khi chia chunk (src/services/text_cleaning.py, D-29).
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field

from src.config import get_settings
from src.services.text_cleaning import clean_pages

MIN_TEXT_CHARS = 40  # dưới ngưỡng này coi là trang gần rỗng (đề xuất)


class IngestionError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass
class ExtractedChunk:
    locator_type: str
    locator_value: int
    text: str
    quality: str


@dataclass
class Extraction:
    file_type: str
    page_count: int
    chunks: list[ExtractedChunk]
    warnings: list[dict] = field(default_factory=list)
    cleaning: dict = field(default_factory=dict)  # thống kê làm sạch (ghi vào audit)


def detect_file_type(content: bytes) -> str:
    if content.startswith(b"%PDF-"):
        return "pdf"
    if content.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                names = set(zf.namelist())
        except zipfile.BadZipFile as e:
            raise IngestionError("CORRUPT_FILE") from e
        if "ppt/presentation.xml" in names:
            if any(n.endswith("vbaProject.bin") for n in names):
                raise IngestionError("MACRO_NOT_ALLOWED")  # FR-06: không thực thi nội dung nhúng/macro
            return "pptx"
    raise IngestionError("UNSUPPORTED_FILE_TYPE")


def _normalize(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split(text: str, max_chars: int, overlap: int) -> list[str]:
    """Chia theo đoạn/câu, không vượt max_chars; chồng lấn overlap ký tự giữa các phần."""
    if len(text) <= max_chars:
        return [text]
    parts, start = [], 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            window = text[start:end]
            cut = max(window.rfind("\n\n"), window.rfind(". "), window.rfind("\n"))
            if cut > max_chars // 2:
                end = start + cut + 1
        parts.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
        # phần chồng lấn bắt đầu ở ranh giới từ, không cắt giữa từ ("Theorem" → "heorem")
        while 0 < start < end and not text[start - 1].isspace():
            start += 1
    return [p for p in parts if p]


def _page_chunks(locator_type: str, number: int, raw: str) -> tuple[list[ExtractedChunk], dict | None]:
    s = get_settings()
    text = _normalize(raw)
    if len(text) < MIN_TEXT_CHARS:
        warning = {"locator_type": locator_type, "locator_value": number, "issue": "empty_or_no_text"}
        if not text:
            return [], warning
        return [ExtractedChunk(locator_type, number, text, "low")], warning
    return [
        ExtractedChunk(locator_type, number, p, "ok") for p in _split(text, s.chunk_max_chars, s.chunk_overlap_chars)
    ], None


def extract_pdf(content: bytes) -> Extraction:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            raise IngestionError("ENCRYPTED_FILE")
        pages = reader.pages
        count = len(pages)
    except PdfReadError as e:
        raise IngestionError("CORRUPT_FILE") from e
    if count > get_settings().upload_max_pages:
        raise IngestionError("TOO_MANY_PAGES")
    raw_pages = []
    for i, page in enumerate(pages, start=1):
        try:
            raw = page.extract_text() or ""
        except Exception:  # noqa: BLE001 — một trang lỗi không làm hỏng cả file; đánh dấu vị trí
            raw = ""
        raw_pages.append(("page", i, raw))
    return _build("pdf", count, raw_pages)


def extract_pptx(content: bytes) -> Extraction:
    from pptx import Presentation

    try:
        prs = Presentation(io.BytesIO(content))
    except Exception as e:  # noqa: BLE001
        raise IngestionError("CORRUPT_FILE") from e
    slides = list(prs.slides)
    if len(slides) > get_settings().upload_max_pages:
        raise IngestionError("TOO_MANY_PAGES")
    raw_pages = []
    for i, slide in enumerate(slides, start=1):
        texts = []
        for shape in slide.shapes:
            if getattr(shape, "has_text_frame", False) and shape.has_text_frame:
                texts.append(shape.text_frame.text)
            elif getattr(shape, "has_table", False) and shape.has_table:
                for row in shape.table.rows:
                    texts.append(" | ".join(cell.text for cell in row.cells))
        raw_pages.append(("slide", i, "\n".join(texts)))
    return _build("pptx", len(slides), raw_pages)


def _build(file_type: str, count: int, raw_pages: list[tuple[str, int, str]]) -> Extraction:
    """Làm sạch toàn tài liệu (cần thống kê header lặp giữa các trang) rồi chia chunk theo từng trang."""
    cleaned, stats = clean_pages(raw_pages)
    toc = set(stats.toc_pages) | set(stats.index_pages)
    chunks, warnings = [], []
    for loc_type, number, text in cleaned:
        if number in toc:
            continue  # trang mục lục/chỉ mục: không phải nội dung học, không index
        cs, w = _page_chunks(loc_type, number, text)
        chunks += cs
        if w:
            warnings.append(w)
    return Extraction(file_type, count, chunks, warnings, stats.as_dict())


def extract(content: bytes) -> Extraction:
    file_type = detect_file_type(content)
    return extract_pdf(content) if file_type == "pdf" else extract_pptx(content)


def needs_review(extraction: Extraction) -> bool:
    """Không có text dùng được hoặc hơn 20% trang lỗi → NeedsReview (ngưỡng đề xuất)."""
    if not extraction.chunks:
        return True
    return len(extraction.warnings) > 0.2 * max(extraction.page_count, 1)
