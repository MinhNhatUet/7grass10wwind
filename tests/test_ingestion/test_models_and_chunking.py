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
    document = Document(
        id="doc1", course_id="MATH101", title="Limits", current_version_id="ver1", document_type="lecture_slide"
    )
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


def test_chunker_respects_nested_section_boundaries():
    document = Document(id="doc1", course_id="SE101", title="Architecture", current_version_id="ver1")
    version = DocumentVersion(
        id="ver1",
        document_id="doc1",
        checksum="a" * 64,
        storage_key="architecture.pdf",
        filename="architecture.pdf",
        mime_type="application/pdf",
        size_bytes=10,
    )
    acl = DocumentACL(version_id="ver1", allowed_roles=["student"])
    integrity = IntegrityLabel(version_id="ver1", type="learning_material")
    page = PageIR(
        id="p1",
        version_id="ver1",
        locator=Locator(type="page", number=1),
        extraction_method="mineru_middle_json",
        elements=[
            Element(id="h1", type=ElementType.TITLE, order=1, heading_level=1, text="Thiết kế phần mềm"),
            Element(id="h2", type=ElementType.TITLE, order=2, heading_level=2, text="Thiết kế kiến trúc"),
            Element(id="t1", type=ElementType.TEXT, order=3, text="Kiến trúc mô tả các thành phần."),
            Element(id="h3", type=ElementType.TITLE, order=4, heading_level=2, text="Thiết kế giao diện"),
            Element(id="t2", type=ElementType.TEXT, order=5, text="Giao diện mô tả tương tác người dùng."),
        ],
    )

    chunks = build_chunks(document, version, acl, integrity, [page], target_tokens=500, max_tokens=800)

    assert len(chunks) == 2
    assert chunks[0].section == "Thiết kế phần mềm > Thiết kế kiến trúc"
    assert "Kiến trúc mô tả" in chunks[0].text
    assert "Giao diện mô tả" not in chunks[0].text
    assert chunks[1].section == "Thiết kế phần mềm > Thiết kế giao diện"
    assert chunks[0].locator.start == chunks[0].locator.end == 1


def test_oversized_section_splits_without_losing_section_path():
    document = Document(id="doc1", course_id="SE101", title="Architecture", current_version_id="ver1")
    version = DocumentVersion(
        id="ver1",
        document_id="doc1",
        checksum="a" * 64,
        storage_key="architecture.pdf",
        filename="architecture.pdf",
        mime_type="application/pdf",
        size_bytes=10,
    )
    acl = DocumentACL(version_id="ver1", allowed_roles=["student"])
    integrity = IntegrityLabel(version_id="ver1", type="learning_material")
    page = PageIR(
        id="p1",
        version_id="ver1",
        locator=Locator(type="page", number=3),
        extraction_method="mineru_middle_json",
        elements=[
            Element(id="h1", type=ElementType.TITLE, order=1, heading_level=1, text="Testing"),
            Element(id="t1", type=ElementType.TEXT, order=2, text="one two three four five"),
            Element(id="t2", type=ElementType.TEXT, order=3, text="six seven eight nine ten"),
        ],
    )

    chunks = build_chunks(document, version, acl, integrity, [page], target_tokens=6, max_tokens=9)

    assert len(chunks) == 2
    assert all(chunk.section == "Testing" for chunk in chunks)
    assert all(chunk.text.startswith("Testing") for chunk in chunks)


def test_repeated_heading_continues_same_section_until_size_limit():
    document = Document(id="doc1", course_id="SE101", title="RUP", current_version_id="ver1")
    version = DocumentVersion(
        id="ver1",
        document_id="doc1",
        checksum="a" * 64,
        storage_key="rup.pdf",
        filename="rup.pdf",
        mime_type="application/pdf",
        size_bytes=10,
    )
    acl = DocumentACL(version_id="ver1", allowed_roles=["student"])
    integrity = IntegrityLabel(version_id="ver1", type="learning_material")
    pages = [
        PageIR(
            id=f"p{number}",
            version_id="ver1",
            locator=Locator(type="page", number=number),
            extraction_method="mineru_middle_json",
            elements=[
                Element(
                    id=f"h{number}",
                    type=ElementType.TITLE,
                    order=1,
                    heading_level=2,
                    text="RUP",
                ),
                Element(id=f"t{number}", type=ElementType.TEXT, order=2, text=f"Nội dung phần {number}"),
            ],
        )
        for number in (1, 2)
    ]

    chunks = build_chunks(document, version, acl, integrity, pages, target_tokens=500, max_tokens=800)

    assert len(chunks) == 1
    assert chunks[0].section == "RUP"
    assert chunks[0].locator.start == 1
    assert chunks[0].locator.end == 2
