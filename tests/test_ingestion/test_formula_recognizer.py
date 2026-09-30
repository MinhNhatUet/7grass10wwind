from src.ingestion.formula.recognizer import (
    FormulaRecognitionResult,
    UnavailableFormulaRecognizer,
    validate_formula_latex,
)


def test_formula_latex_validation_rejects_control_chars():
    assert validate_formula_latex(r"\mathbf{F}(x,y)")
    assert not validate_formula_latex("\x08(x,y)=\x10")


def test_unavailable_recognizer_is_non_crashing_failure():
    result = UnavailableFormulaRecognizer().recognize("missing.png")

    assert isinstance(result, FormulaRecognitionResult)
    assert not result.success
    assert "UNAVAILABLE" in result.error
