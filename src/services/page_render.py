"""Render một trang PDF thành ảnh PNG phía server (FR-04.4: mở đúng trang; D-31).

Trình duyệt chỉ nhận ảnh từng trang, không nhận file gốc — nên sách "không cho tải" (FR-04.5) vẫn xem được
mà không lộ bản gốc. Quyền được kiểm tra ở API trước khi gọi hàm này.
"""

from __future__ import annotations

import io
import threading
from functools import lru_cache

import pypdfium2 as pdfium

from src.services import storage

MIN_WIDTH, MAX_WIDTH = 400, 1600
_lock = threading.Lock()  # pdfium không an toàn đa luồng


class PageOutOfRangeError(Exception):
    pass


def render_png(storage_key: str, page: int, width: int) -> bytes:
    width = max(MIN_WIDTH, min(MAX_WIDTH, width))
    return _render(storage_key, page, (width // 100) * 100)  # làm tròn để cache trúng nhiều hơn


@lru_cache(maxsize=64)
def _render(storage_key: str, page: int, width: int) -> bytes:
    with _lock:
        pdf = pdfium.PdfDocument(str(storage.path_of(storage_key)))
        try:
            if not 1 <= page <= len(pdf):
                raise PageOutOfRangeError(page)
            p = pdf[page - 1]
            image = p.render(scale=width / p.get_width()).to_pil()
            buf = io.BytesIO()
            image.save(buf, format="PNG", optimize=True)
            return buf.getvalue()
        finally:
            pdf.close()
