from __future__ import annotations


def score_quality(flags: list[str]) -> float:
    if not flags:
        return 1.0
    severe = {"TEXT_EMPTY", "OCR_LOW_CONFIDENCE", "FORMULA_UNREADABLE", "TABLE_UNREADABLE", "PAGE_PARTIAL_EXTRACTION"}
    penalty = sum(0.25 if flag in severe else 0.1 for flag in flags)
    return max(0.0, round(1.0 - penalty, 2))
