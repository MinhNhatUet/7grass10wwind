from pathlib import Path

from src.ingestion.chunking.chunker import build_chunks
from src.ingestion.formula.config import FormulaFallbackConfig
from src.ingestion.formula.recognizer import FormulaRecognitionResult, FormulaRecognizer
from src.ingestion.models.document import Document, DocumentACL, DocumentVersion, IntegrityLabel
from src.ingestion.models.element import ElementType
from src.ingestion.parsers.pdf_parser import PDFNativeParser
from src.ingestion.quality.flags import QualityFlag


class StaticFormulaRecognizer(FormulaRecognizer):
    model_name = "PP-FormulaNet_plus-M"

    def __init__(self, success: bool = True):
        self.success = success

    def recognize(self, image_path: str | Path) -> FormulaRecognitionResult:
        if self.success:
            return FormulaRecognitionResult(
                latex=r"\mathbf{F}(x,y)=P(x,y)\mathbf{i}+Q(x,y)\mathbf{j}",
                model_name=self.model_name,
                success=True,
            )
        return FormulaRecognitionResult(model_name=self.model_name, success=False, error="FORMULA_OCR_FAILED")


def _make_pdf(path: Path) -> None:
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=360, height=180)
    page.insert_text((36, 40), "Vector field")
    page.insert_text((36, 80), "\x08(x,y)=\x10+\x0e")
    page.insert_text((36, 120), "where P and Q are scalar functions.")
    doc.save(path)
    doc.close()


def _metadata():
    document = Document(id="doc1", course_id="MATH101", title="Vector Field", current_version_id="ver1")
    version = DocumentVersion(
        id="ver1",
        document_id="doc1",
        checksum="a" * 64,
        storage_key="formula.pdf",
        filename="formula.pdf",
        mime_type="application/pdf",
        size_bytes=100,
    )
    acl = DocumentACL(version_id="ver1", allowed_roles=["student"])
    integrity = IntegrityLabel(version_id="ver1", type="learning_material")
    return document, version, acl, integrity


def test_pdf_formula_fallback_recognizes_and_keeps_chunk_clean():
    fixture_dir = Path("test_artifacts/pdf_formula")
    fixture_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = fixture_dir / "formula.pdf"
    _make_pdf(pdf_path)

    parser = PDFNativeParser(
        artifact_root=fixture_dir / "artifacts",
        formula_config=FormulaFallbackConfig(),
        formula_recognizer=StaticFormulaRecognizer(success=True),
    )
    parsed = parser.parse(pdf_path, "ver1")

    formula = next(element for element in parsed.pages[0].elements if element.type == ElementType.FORMULA)
    assert formula.latex
    assert formula.model_name == "PP-FormulaNet_plus-M"
    assert formula.verified is False
    assert QualityFlag.FORMULA_RECOGNIZED.value in formula.quality_flags
    assert Path(formula.crop_path).exists()

    document, version, acl, integrity = _metadata()
    chunks = build_chunks(document, version, acl, integrity, parsed.pages)
    joined = "\n".join(chunk.text for chunk in chunks)

    assert "\x08" not in joined
    assert "\x10" not in joined
    assert "\x0e" not in joined
    assert "[FORMULA]" in joined


def test_pdf_formula_fallback_failure_keeps_crop_and_unreadable_marker():
    fixture_dir = Path("test_artifacts/pdf_formula_failure")
    fixture_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = fixture_dir / "formula.pdf"
    _make_pdf(pdf_path)

    parser = PDFNativeParser(
        artifact_root=fixture_dir / "artifacts",
        formula_config=FormulaFallbackConfig(),
        formula_recognizer=StaticFormulaRecognizer(success=False),
    )
    parsed = parser.parse(pdf_path, "ver1")

    formula = next(element for element in parsed.pages[0].elements if element.type == ElementType.FORMULA)
    assert formula.latex is None
    assert formula.needs_review
    assert QualityFlag.FORMULA_UNREADABLE.value in formula.quality_flags
    assert Path(formula.crop_path).exists()

    document, version, acl, integrity = _metadata()
    chunks = build_chunks(document, version, acl, integrity, parsed.pages)

    assert "[FORMULA_UNREADABLE]" in "\n".join(chunk.text for chunk in chunks)
