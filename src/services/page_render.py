"""Render a single bounded PDF page; authorization belongs to the API on every request."""

from __future__ import annotations

import io
import re
import threading
from functools import lru_cache
from typing import Any

import pypdfium2 as pdfium

from src.services import storage

_lock = threading.Lock()  # PDFium is not thread-safe.


class PageOutOfRangeError(Exception):
    pass


_NOT_CHAPTER = re.compile(
    r"^(contents|table of contents|preface|foreword|index|bibliography|references|hints?|solutions?|answers?|appendix)\b"
    r"|^[A-Z]\.\s",
    re.I,
)
_NOT_SECTION = re.compile(r"^(\d+\.\s*)?(exercises?|problems|notes|summary)$", re.I)
_NUMBERED = re.compile(r"^(\d{1,2})\.\s+(.+)$")
# PDF xuất từ PowerPoint: mỗi slide là một mục "Slide N: tiêu đề" (PowerPoint tiếng Việt: "Trang chiếu N: …"; slide
# không có tiêu đề → chỉ "Trang chiếu N"). Bỏ tiền tố; mục rỗng / chung chung / chỉ là "Chương N" không làm chủ đề.
_SLIDE_PREFIX = re.compile(r"^(slide(\s+number)?|trang chiếu)\s*\d+\s*:?\s*", re.I)
GENERIC_TITLE = re.compile(
    r"^(nội dung( chi tiết)?|giới thiệu|tổng kết|tóm tắt|mục tiêu|câu hỏi|thảo luận|tài liệu tham khảo|bài tập|"
    r"kết luận|ví dụ|(chương|chapter|bài)\s*\d+)\W*$",
    re.I,
)


def _slide_title(title: str) -> str | None:
    """Tiêu đề mục lục đã bỏ tiền tố slide; None nếu không đủ nghĩa để làm chương/chủ đề (rỗng, "Nội dung"…)."""
    t = re.sub(r"\s+", " ", _SLIDE_PREFIX.sub("", title)).strip()
    return None if not t or GENERIC_TITLE.match(t) else t


@lru_cache(maxsize=64)  # bản tài liệu bất biến (BR-07) → mục lục theo storage_key không đổi
def chapters(storage_key: str) -> tuple[dict[str, Any], ...]:
    """Chương (mục lục cấp 0 của PDF) + các mục con; bỏ Contents/Preface/Index/Hints…, bỏ mục Exercises (D-44)."""
    with _lock:
        with pdfium.PdfDocument(str(storage.path_of(storage_key))) as pdf:
            toc = [
                (it.level, it.get_title().strip(), (it.get_dest().get_index() + 1) if it.get_dest() else None)
                for it in pdf.get_toc(max_depth=2)
            ]
    out: list[dict[str, Any]] = []
    for level, raw, page in toc:
        title = _slide_title(raw)
        if level == 0:
            if not title or _NOT_CHAPTER.match(title):
                out.append({"skip": True})
                continue
            m = _NUMBERED.match(title)
            out.append({"chapter": m.group(1) if m else str(sum(1 for c in out if not c.get("skip")) + 1),
                        "title": m.group(2) if m else title, "page": page, "sections": []})  # fmt: skip
        elif level == 1 and title and out and not out[-1].get("skip") and not _NOT_SECTION.match(title):
            m = _NUMBERED.match(title)
            section = m.group(2) if m else title
            if section.casefold() != out[-1]["title"].casefold() and section not in out[-1]["sections"]:
                out[-1]["sections"].append(section)
    return tuple(c for c in out if not c.get("skip"))


def pdf_text(data: bytes, max_chars: int) -> str:
    """Văn bản của một PDF tải lên (không lưu file). PDF hỏng → ValueError; dừng khi đủ max_chars."""
    parts: list[str] = []
    size = 0
    with _lock:
        try:
            pdf = pdfium.PdfDocument(data)
        except pdfium.PdfiumError as e:
            raise ValueError("PDF không đọc được") from e
        with pdf:
            for i in range(len(pdf)):
                page = pdf[i]
                try:
                    text = page.get_textpage().get_text_range().strip()
                finally:
                    page.close()
                if text:
                    parts.append(f"[Trang {i + 1}]\n{text}")
                    size += len(text)
                if size >= max_chars:
                    break
    return "\n\n".join(parts)[:max_chars]


def pdf_page_count(data: bytes) -> int:
    """Số trang của một PDF tải lên (không lưu file). PDF hỏng → ValueError."""
    with _lock:
        try:
            pdf = pdfium.PdfDocument(data)
        except pdfium.PdfiumError as e:
            raise ValueError("PDF không đọc được") from e
        with pdf:
            return len(pdf)


def pdf_page_pngs(data: bytes, max_pages: int, width: int = 1400) -> list[bytes]:
    """Ảnh PNG các trang đầu của một PDF tải lên (không lưu file) — để OCR bản scan. PDF hỏng → ValueError."""
    out: list[bytes] = []
    with _lock:
        try:
            pdf = pdfium.PdfDocument(data)
        except pdfium.PdfiumError as e:
            raise ValueError("PDF không đọc được") from e
        with pdf:
            for i in range(min(len(pdf), max_pages)):
                page = pdf[i]
                try:
                    bitmap = page.render(scale=width / page.get_size()[0])
                    image = bitmap.to_pil()
                    buf = io.BytesIO()
                    image.save(buf, format="PNG")
                    out.append(buf.getvalue())
                    image.close()
                    bitmap.close()
                finally:
                    page.close()
    return out


@lru_cache(maxsize=256)  # file lưu theo checksum, bất biến → số trang theo storage_key không đổi
def stored_page_count(storage_key: str) -> int:
    """Số trang của một PDF đã lưu (đề tạo trước khi ghi số trang vào source)."""
    with _lock:
        with pdfium.PdfDocument(str(storage.path_of(storage_key))) as pdf:
            return len(pdf)


def render_png(storage_key: str, page: int, width: int = 1000) -> bytes:
    with _lock:
        with pdfium.PdfDocument(str(storage.path_of(storage_key))) as pdf:
            if not 1 <= page <= len(pdf):
                raise PageOutOfRangeError(page)
            pdf_page = pdf[page - 1]
            try:
                w, h = pdf_page.get_size()
                scale = min(max(400, min(width, 1600)) / w, 2200 / h)
                bitmap = pdf_page.render(scale=scale)
                try:
                    image = bitmap.to_pil()
                    try:
                        out = io.BytesIO()
                        image.save(out, format="PNG")
                        return out.getvalue()
                    finally:
                        image.close()
                finally:
                    bitmap.close()
            finally:
                pdf_page.close()
