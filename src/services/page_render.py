"""Render a single bounded PDF page; authorization belongs to the API on every request."""
from __future__ import annotations

import io
import threading

import pypdfium2 as pdfium

from src.services import storage

_lock = threading.Lock()  # PDFium is not thread-safe.


class PageOutOfRangeError(Exception):
    pass


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
