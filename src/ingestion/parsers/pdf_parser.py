from __future__ import annotations

from pathlib import Path

from src.ingestion.formula.candidate import is_formula_candidate
from src.ingestion.formula.config import FormulaFallbackConfig
from src.ingestion.formula.cropper import crop_formula_region
from src.ingestion.formula.recognizer import FormulaRecognizer, build_formula_recognizer
from src.ingestion.models.element import Element, ElementType
from src.ingestion.models.page import Locator, PageIR, ParsedDocument
from src.ingestion.parsers.base import BaseParser, ParserDependencyError
from src.ingestion.quality.detector import detect_page_quality
from src.ingestion.quality.flags import QualityFlag
from src.ingestion.quality.text_quality import evaluate_native_text


class PDFNativeParser(BaseParser):
    def __init__(
        self,
        artifact_root: str | Path = "artifacts",
        formula_config: FormulaFallbackConfig | None = None,
        formula_recognizer: FormulaRecognizer | None = None,
    ):
        self.artifact_root = Path(artifact_root)
        self.formula_config = formula_config or FormulaFallbackConfig()
        self.formula_recognizer = formula_recognizer or build_formula_recognizer(self.formula_config)

    def can_handle(self, mime_type: str) -> bool:
        return mime_type == "application/pdf"

    def parse(self, file_path: str | Path, version_id: str) -> ParsedDocument:
        try:
            import fitz
        except ImportError as exc:
            raise ParserDependencyError("PyMuPDF is required for PDF parsing") from exc

        pages: list[PageIR] = []
        with fitz.open(Path(file_path)) as pdf:
            for index, page in enumerate(pdf, start=1):
                elements: list[Element] = []
                page_flags: set[str] = set()
                span_dict = page.get_text("dict")
                text_spans = _collect_text_spans(span_dict)
                neighboring_text = [span["text"] for span in text_spans if span["text"].strip()]
                for order, span in enumerate(text_spans, start=1):
                    text = str(span["text"])
                    stripped_text = text.strip()
                    if not stripped_text:
                        continue
                    bbox = [float(value) for value in span["bbox"]]
                    font = span.get("font")
                    font_size = float(span.get("size") or 0.0)
                    native_quality = evaluate_native_text(
                        stripped_text,
                        corruption_threshold=self.formula_config.native_corruption_threshold,
                    )
                    if native_quality.usable:
                        elements.append(
                            Element(
                                id=f"{version_id}_page_{index:03d}_el_{order:03d}",
                                type=ElementType.TEXT,
                                bbox=bbox,
                                order=order,
                                source="native",
                                confidence=native_quality.score,
                                text=stripped_text,
                                page_number=index,
                                native_text=text,
                                native_font=font,
                                native_font_size=font_size,
                                native_quality=native_quality.score,
                            )
                        )
                        continue

                    page_flags.add(QualityFlag.NATIVE_TEXT_CORRUPTED.value)
                    candidate = is_formula_candidate(
                        text=stripped_text,
                        font=font,
                        bbox=bbox,
                        neighboring_text=neighboring_text,
                    )
                    if not candidate or not self.formula_config.enabled:
                        elements.append(
                            Element(
                                id=f"{version_id}_page_{index:03d}_corrupt_{order:03d}",
                                type=ElementType.TEXT,
                                bbox=bbox,
                                order=order,
                                source="native_corrupted",
                                confidence=native_quality.score,
                                page_number=index,
                                native_text=text,
                                native_font=font,
                                native_font_size=font_size,
                                native_quality=native_quality.score,
                                needs_review=True,
                                quality_flags=[
                                    QualityFlag.NATIVE_TEXT_CORRUPTED.value,
                                    QualityFlag.PAGE_PARTIAL_EXTRACTION.value,
                                ],
                            )
                        )
                        page_flags.add(QualityFlag.PAGE_PARTIAL_EXTRACTION.value)
                        continue

                    crop = crop_formula_region(
                        page=page,
                        bbox=bbox,
                        version_id=version_id,
                        page_number=index,
                        element_number=order,
                        artifact_root=self.artifact_root,
                        config=self.formula_config,
                    )
                    result = self.formula_recognizer.recognize(crop.path)
                    formula_flags = [
                        QualityFlag.NATIVE_TEXT_CORRUPTED.value,
                        QualityFlag.FORMULA_PRESENT.value,
                        QualityFlag.FORMULA_NATIVE_CORRUPTED.value,
                    ]
                    latex = result.latex if result.success else None
                    needs_review = not result.success
                    if result.success:
                        formula_flags.append(QualityFlag.FORMULA_RECOGNIZED.value)
                    else:
                        if result.error and "UNAVAILABLE" in result.error:
                            formula_flags.append(QualityFlag.FORMULA_OCR_UNAVAILABLE.value)
                        else:
                            formula_flags.append(QualityFlag.FORMULA_OCR_FAILED.value)
                        formula_flags.append(QualityFlag.FORMULA_UNREADABLE.value)
                    page_flags.update(formula_flags)
                    elements.append(
                        Element(
                            id=f"{version_id}_page_{index:03d}_formula_{order:03d}",
                            type=ElementType.FORMULA,
                            bbox=bbox,
                            order=order,
                            source="formula_fallback",
                            confidence=1.0 if result.success else native_quality.score,
                            latex=latex,
                            page_number=index,
                            native_text=text,
                            native_font=font,
                            native_font_size=font_size,
                            native_quality=native_quality.score,
                            crop_path=crop.path.as_posix(),
                            recognition_method="formula_ocr",
                            model_name=result.model_name,
                            verified=False,
                            needs_review=needs_review,
                            recognition_error=result.error,
                            quality_flags=formula_flags,
                        )
                    )
                image_count = len(page.get_images(full=True))
                for image_index in range(image_count):
                    elements.append(
                        Element(
                            id=f"{version_id}_page_{index:03d}_image_{image_index + 1:03d}",
                            type=ElementType.IMAGE,
                            order=len(elements) + 1,
                            source="native",
                            confidence=1.0,
                            quality_flags=["VISUAL_CONTENT"],
                        )
                    )
                raw_text = "\n".join(element.text or "" for element in elements if element.text)
                quality_flags = detect_page_quality(raw_text=raw_text, element_count=len(elements), image_count=image_count)
                quality_flags = sorted(set(quality_flags).union(page_flags))
                pages.append(
                    PageIR(
                        id=f"{version_id}_page_{index:03d}",
                        version_id=version_id,
                        locator=Locator(type="page", number=index),
                        width=page.rect.width,
                        height=page.rect.height,
                        raw_text=raw_text,
                        elements=elements,
                        extraction_method="native_pdf",
                        quality_flags=quality_flags,
                    )
                )
        return ParsedDocument(version_id=version_id, pages=pages, native_result=pages, selected_result=pages)


def _collect_text_spans(page_dict: dict) -> list[dict]:
    spans: list[dict] = []
    for block in page_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                spans.append(span)
    return spans
