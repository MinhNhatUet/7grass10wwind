from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from src.ingestion.formula.config import FormulaFallbackConfig


@dataclass(frozen=True)
class FormulaCrop:
    path: Path
    bbox: list[float]


def expand_and_clip_bbox(
    bbox: list[float], page_width: float, page_height: float, padding_x: float, padding_y: float
) -> list[float]:
    x0, y0, x1, y1 = bbox
    return [
        max(0.0, x0 - padding_x),
        max(0.0, y0 - padding_y),
        min(page_width, x1 + padding_x),
        min(page_height, y1 + padding_y),
    ]


def crop_formula_region(
    page,
    bbox: list[float],
    version_id: str,
    page_number: int,
    element_number: int,
    artifact_root: str | Path,
    config: FormulaFallbackConfig,
) -> FormulaCrop:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF is required for formula cropping") from exc

    clipped_bbox = expand_and_clip_bbox(
        bbox=bbox,
        page_width=float(page.rect.width),
        page_height=float(page.rect.height),
        padding_x=config.bbox_padding_x,
        padding_y=config.bbox_padding_y,
    )
    output_dir = Path(artifact_root) / "formulas" / version_id / f"page_{page_number:04d}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"formula_{element_number:04d}.png"
    scale = config.render_dpi / 72.0
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=fitz.Rect(clipped_bbox), alpha=False)
    pixmap.save(output_path)
    return FormulaCrop(path=output_path, bbox=clipped_bbox)
