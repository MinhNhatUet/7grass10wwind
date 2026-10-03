from pathlib import Path

from src.ingestion.formula.config import FormulaFallbackConfig
from src.ingestion.formula.cropper import expand_and_clip_bbox


def test_expand_and_clip_bbox_keeps_page_bounds():
    bbox = expand_and_clip_bbox(
        bbox=[2, 3, 98, 99],
        page_width=100,
        page_height=100,
        padding_x=12,
        padding_y=8,
    )

    assert bbox == [0.0, 0.0, 100, 100]


def test_formula_config_defaults_match_plan():
    config = FormulaFallbackConfig()

    assert config.model_name == "PP-FormulaNet_plus-M"
    assert config.render_dpi == 300
    assert Path("artifacts/formulas").as_posix() == "artifacts/formulas"
