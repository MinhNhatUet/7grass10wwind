from src.ingestion.chunking.chunker import build_chunks
from src.ingestion.models.document import Document, DocumentACL, DocumentVersion, IntegrityLabel
from src.ingestion.models.element import Element, ElementType
from src.ingestion.models.page import Locator, PageIR
from src.ingestion.quality.flags import QualityFlag


def test_bbox_must_have_four_coordinates():
    try:
        Element(id="e1", type=ElementType.TEXT, bbox=[1, 2], order=1)
    except ValueError as exc:
        assert "bbox" in str(exc)
    else:
        raise AssertionError("bbox validation should fail")


def test_chunk_keeps_traceability_and_boundaries():
    document = Document(id="doc1", course_id="MATH101", title="Limits", current_version_id="ver1", document_type="lecture_slide")
    version = DocumentVersion(
        id="ver1",
        document_id="doc1",
        checksum="a" * 64,
        storage_key="calculus/lecture.pdf",
        filename="lecture.pdf",
        mime_type="application/pdf",
        size_bytes=10,
    )
    acl = DocumentACL(version_id="ver1", allowed_roles=["student"])
    integrity = IntegrityLabel(version_id="ver1", type="learning_material")
    page = PageIR(
        id="p1",
        version_id="ver1",
        locator=Locator(type="page", number=1),
        raw_text="Definition of limit",
        extraction_method="native_pdf",
        elements=[
            Element(id="e1", type=ElementType.TITLE, order=1, text="Limits"),
            Element(id="e2", type=ElementType.FORMULA, order=2, latex="\\lim_{x\\to a} f(x) = L"),
            Element(id="e3", type=ElementType.TEXT, order=3, text="The formula describes a limit."),
        ],
    )

    chunks = build_chunks(document, version, acl, integrity, [page], target_tokens=5, max_tokens=20)

    assert chunks[0].course_id == "MATH101"
    assert chunks[0].version_id == "ver1"
    assert chunks[0].locator.start == 1
    assert "e2" in chunks[0].element_ids


def test_chunker_marks_and_sanitizes_control_chars_instead_of_stopping():
    document = Document(id="doc1", course_id="MATH101", title="Limits", current_version_id="ver1")
    version = DocumentVersion(
        id="ver1",
        document_id="doc1",
        checksum="a" * 64,
        storage_key="calculus/lecture.pdf",
        filename="lecture.pdf",
        mime_type="application/pdf",
        size_bytes=10,
    )
    acl = DocumentACL(version_id="ver1", allowed_roles=["student"])
    integrity = IntegrityLabel(version_id="ver1", type="learning_material")
    page = PageIR(
        id="p1",
        version_id="ver1",
        locator=Locator(type="page", number=1),
        extraction_method="native_pdf",
        elements=[Element(id="e1", type=ElementType.TEXT, order=1, text="bad\x08text")],
    )

    chunks = build_chunks(document, version, acl, integrity, [page])

    assert "[CONTROL_CHAR]" in chunks[0].text
    assert "\x08" not in chunks[0].text
    assert QualityFlag.CHUNK_CONTAINS_CONTROL_CHAR.value in chunks[0].quality_flags
