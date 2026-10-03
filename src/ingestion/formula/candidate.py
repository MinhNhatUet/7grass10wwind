from __future__ import annotations

import re

MATH_FONT_HINTS = (
    "cambria math",
    "symbol",
    "mt extra",
    "math",
    "cmsy",
    "cmmi",
    "cmex",
    "stix",
    "latinmodernmath",
)
MATH_CONTEXT_PATTERN = re.compile(
    r"\b(vector|field|formula|equation|function|scalar|matrix|integral|derivative|"
    r"công thức|phương trình|hàm|ma trận|tích phân|đạo hàm)\b",
    re.IGNORECASE,
)
MATH_OPERATORS = set("=+-/*<>≤≥∑∫√()[]{}.,")


def _symbol_ratio(text: str) -> float:
    if not text:
        return 0.0
    symbol_count = sum(1 for ch in text if ch in MATH_OPERATORS or not ch.isalnum())
    return symbol_count / max(len(text), 1)


def is_formula_candidate(
    text: str,
    font: str | None,
    bbox: list[float],
    neighboring_text: list[str],
) -> bool:
    font_lower = (font or "").lower()
    has_math_font = any(hint in font_lower for hint in MATH_FONT_HINTS)
    has_operator = any(ch in MATH_OPERATORS for ch in text)
    has_math_context = any(MATH_CONTEXT_PATTERN.search(neighbor) for neighbor in neighboring_text if neighbor)
    looks_like_display = (bbox[2] - bbox[0]) >= 80 and (bbox[3] - bbox[1]) >= 8
    symbol_heavy = _symbol_ratio(text) >= 0.35

    return bool(has_math_font or (has_operator and (symbol_heavy or has_math_context or looks_like_display)))
