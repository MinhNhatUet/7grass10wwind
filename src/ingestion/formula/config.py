from __future__ import annotations

from pydantic import BaseModel, Field


class FormulaFallbackConfig(BaseModel):
    enabled: bool = True
    provider: str = "paddleocr"
    model_name: str = "PP-FormulaNet_plus-M"
    device: str = "auto"
    native_corruption_threshold: float = Field(default=0.05, ge=0.0, le=1.0)
    render_dpi: int = Field(default=300, ge=72)
    bbox_padding_x: float = Field(default=12.0, ge=0.0)
    bbox_padding_y: float = Field(default=8.0, ge=0.0)
    pipeline_version: str = "formula_fallback_v1"
