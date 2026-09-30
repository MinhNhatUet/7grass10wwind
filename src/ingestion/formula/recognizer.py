from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

from src.ingestion.formula.config import FormulaFallbackConfig
from src.ingestion.quality.text_quality import contains_unsafe_control_chars


class FormulaRecognitionResult(BaseModel):
    latex: str | None = None
    model_name: str
    success: bool = False
    error: str | None = None


def validate_formula_latex(latex: str | None) -> bool:
    if not latex:
        return False
    stripped = latex.strip()
    if not stripped or len(stripped) > 5000:
        return False
    if stripped.lower() in {"none", "null", "error", "[formula unreadable]"}:
        return False
    return not contains_unsafe_control_chars(stripped)


class FormulaRecognizer:
    model_name: str

    def recognize(self, image_path: str | Path) -> FormulaRecognitionResult:
        raise NotImplementedError


class PaddleFormulaRecognizer(FormulaRecognizer):
    def __init__(self, config: FormulaFallbackConfig):
        self.model_name = config.model_name
        self.device = config.device
        self._model = None
        self._load_error: str | None = None

    def _load(self):
        if self._model is not None or self._load_error is not None:
            return
        try:
            from paddleocr import FormulaRecognition

            kwargs = {"model_name": self.model_name}
            if self.device != "auto":
                kwargs["device"] = "gpu" if self.device == "cuda" else self.device
            self._model = FormulaRecognition(**kwargs)
        except Exception as exc:  # pragma: no cover - depends on optional heavy runtime
            self._load_error = f"{type(exc).__name__}: {exc}"

    def recognize(self, image_path: str | Path) -> FormulaRecognitionResult:
        self._load()
        if self._load_error:
            return FormulaRecognitionResult(
                model_name=self.model_name,
                success=False,
                error=f"FORMULA_OCR_UNAVAILABLE: {self._load_error}",
            )
        try:
            output = self._model.predict(input=str(image_path))
            latex = _extract_latex_from_paddle_output(output)
            if validate_formula_latex(latex):
                return FormulaRecognitionResult(latex=latex, model_name=self.model_name, success=True)
            return FormulaRecognitionResult(
                latex=latex,
                model_name=self.model_name,
                success=False,
                error="FORMULA_OCR_FAILED: invalid latex output",
            )
        except Exception as exc:  # pragma: no cover - depends on optional heavy runtime
            return FormulaRecognitionResult(
                model_name=self.model_name,
                success=False,
                error=f"FORMULA_OCR_FAILED: {type(exc).__name__}: {exc}",
            )


class UnavailableFormulaRecognizer(FormulaRecognizer):
    def __init__(self, model_name: str = "PP-FormulaNet_plus-M"):
        self.model_name = model_name

    def recognize(self, image_path: str | Path) -> FormulaRecognitionResult:
        return FormulaRecognitionResult(
            model_name=self.model_name,
            success=False,
            error="FORMULA_OCR_UNAVAILABLE: recognizer not configured",
        )


def build_formula_recognizer(config: FormulaFallbackConfig) -> FormulaRecognizer:
    if not config.enabled:
        return UnavailableFormulaRecognizer(model_name=config.model_name)
    if config.provider == "paddleocr":
        return PaddleFormulaRecognizer(config=config)
    return UnavailableFormulaRecognizer(model_name=config.model_name)


def _extract_latex_from_paddle_output(output) -> str | None:
    if isinstance(output, str):
        return output
    if isinstance(output, dict):
        for key in ("rec_text", "latex", "text", "result"):
            value = output.get(key)
            if isinstance(value, str):
                return value
    if isinstance(output, list):
        for item in output:
            latex = _extract_latex_from_paddle_output(item)
            if latex:
                return latex
    return None
