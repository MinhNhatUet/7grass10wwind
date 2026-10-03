from pathlib import Path

from src.ingestion.course_registry import CourseRegistry
from src.ingestion.inventory.checksum import sha256_file
from src.ingestion.inventory.mime import detect_mime_type
from src.ingestion.inventory.scanner import scan_corpus

FIXTURE_ROOT = Path("test_artifacts/ingestion_inventory")


def _fixture_path(name: str) -> Path:
    FIXTURE_ROOT.mkdir(parents=True, exist_ok=True)
    return FIXTURE_ROOT / name


def _registry() -> CourseRegistry:
    path = _fixture_path("courses.yaml")
    path.write_text(
        """
courses:
  calculus:
    course_id: MATH101
    course_code: MATH101
    course_name: Calculus I
""",
        encoding="utf-8",
    )
    return CourseRegistry.load(path)


def test_checksum_is_stable():
    file_path = _fixture_path("sample.txt")
    file_path.write_text("hello", encoding="utf-8")

    assert sha256_file(file_path) == sha256_file(file_path)


def test_pdf_signature_detection():
    file_path = _fixture_path("sample.pdf")
    file_path.write_bytes(b"%PDF-1.7\nbody")

    mime_type, warnings = detect_mime_type(file_path)

    assert mime_type == "application/pdf"
    assert warnings == []


def test_scan_detects_duplicate_checksum():
    root = _fixture_path("raw_duplicates")
    course = root / "calculus"
    course.mkdir(parents=True, exist_ok=True)
    (course / "a.pdf").write_bytes(b"%PDF-1.7\nsame")
    (course / "b.pdf").write_bytes(b"%PDF-1.7\nsame")

    records = scan_corpus(root, _registry())

    assert len(records) == 2
    assert all("duplicate_checksum" in record.warnings for record in records)
