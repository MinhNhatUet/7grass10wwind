"""Safe, deterministic source snippet and locator builders."""

from __future__ import annotations

import re

from src.knowledge_hub.models import Chunk, Locator


def build_snippet(text: str, max_chars: int = 300) -> str:
    if max_chars <= 0:
        raise ValueError("max_chars must be positive")
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= max_chars:
        return normalized
    if max_chars == 1:
        return "…"
    return normalized[: max_chars - 1].rstrip() + "…"


def build_locator(chunk: Chunk | object) -> Locator | None:
    page = getattr(chunk, "page", None)
    slide = getattr(chunk, "slide", None)
    section = getattr(chunk, "section", None)
    if page is None and slide is None and section is None:
        return None
    return Locator(page=page, slide=slide, section=section)
