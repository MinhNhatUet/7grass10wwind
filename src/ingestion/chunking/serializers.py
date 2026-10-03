from __future__ import annotations

from src.ingestion.models.element import Element, ElementType


def serialize_element(element: Element) -> str:
    if element.type == ElementType.TABLE:
        lines = [" | ".join(element.headers)] if element.headers else []
        lines.extend(" | ".join(row) for row in element.rows)
        table = "\n".join(line for line in lines if line.strip())
        return f"[TABLE]\n{table}" if table else (element.text or "")
    if element.type == ElementType.FORMULA:
        if element.latex:
            return f"[FORMULA] {element.latex}"
        return "[FORMULA_UNREADABLE]"
    if element.type in {ElementType.IMAGE, ElementType.FIGURE, ElementType.CHART}:
        parts = [element.caption, element.nearby_text]
        return "\n".join(part for part in parts if part)
    return element.text or ""
