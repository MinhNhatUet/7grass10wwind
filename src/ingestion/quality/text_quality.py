from __future__ import annotations

from pydantic import BaseModel, Field


class NativeTextQuality(BaseModel):
    usable: bool
    score: float = Field(ge=0.0, le=1.0)
    corruption_ratio: float = Field(ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list)


def is_unsafe_control_char(ch: str) -> bool:
    if ch in "\n\t":
        return False
    code = ord(ch)
    return code < 32 or 127 <= code <= 159


def contains_unsafe_control_chars(text: str) -> bool:
    return any(is_unsafe_control_char(ch) for ch in text)


def replace_unsafe_control_chars(text: str, replacement: str = "[CONTROL_CHAR]") -> str:
    return "".join(replacement if is_unsafe_control_char(ch) else ch for ch in text)


def evaluate_native_text(text: str, corruption_threshold: float = 0.05) -> NativeTextQuality:
    if not text:
        return NativeTextQuality(usable=False, score=0.0, corruption_ratio=1.0, reasons=["empty_text"])

    bad = 0
    printable = 0
    reasons: set[str] = set()
    for ch in text:
        if ch in "\n\t":
            printable += 1
            continue
        code = ord(ch)
        if code < 32:
            bad += 1
            reasons.add("c0_control_character")
        elif 127 <= code <= 159:
            bad += 1
            reasons.add("c1_control_character")
        elif ch == "\ufffd":
            bad += 1
            reasons.add("replacement_character")
        elif ch.isprintable():
            printable += 1
        else:
            bad += 1
            reasons.add("non_printable_character")

    total = max(len(text), 1)
    corruption_ratio = bad / total
    printable_ratio = printable / total
    if printable_ratio < 0.75:
        reasons.add("low_printable_ratio")
    # Any unsafe control/replacement character can poison downstream chunks.
    # Keep the threshold as diagnostic metadata, but do not treat such spans as semantic text.
    usable = not reasons and corruption_ratio <= corruption_threshold and printable_ratio >= 0.75
    return NativeTextQuality(
        usable=usable,
        score=max(0.0, round(1.0 - corruption_ratio, 4)),
        corruption_ratio=round(corruption_ratio, 4),
        reasons=sorted(reasons),
    )
