from src.ingestion.formula.candidate import is_formula_candidate


def test_corrupted_math_font_is_candidate():
    assert is_formula_candidate(
        text="\x08(x,y)=\x10",
        font="Cambria Math",
        bbox=[10, 10, 180, 30],
        neighboring_text=[],
    )


def test_corrupted_operator_display_span_is_candidate():
    assert is_formula_candidate(
        text="\x08(x,y)=\x10+\x0e",
        font="Unknown",
        bbox=[10, 10, 220, 35],
        neighboring_text=["A vector field is defined by"],
    )


def test_corrupted_normal_text_is_not_forced_to_formula():
    assert not is_formula_candidate(
        text="\x08abc",
        font="Unknown",
        bbox=[10, 10, 30, 16],
        neighboring_text=[],
    )
