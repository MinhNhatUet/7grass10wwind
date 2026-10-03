from src.ingestion.inventory.scanner import InventoryRecord
from src.ingestion.metadata.resolver import resolve_metadata, validate_resolved_metadata


def _record(filename: str = "lecture.pdf") -> InventoryRecord:
    return InventoryRecord(
        relative_path=f"calculus/{filename}",
        course_id="MATH101",
        filename=filename,
        extension=".pdf",
        mime_type="application/pdf",
        size_bytes=12,
        sha256="a" * 64,
    )


def test_defaults_only_can_create_valid_draft():
    defaults = {
        "MATH101": {
            "owner_id": "teacher_001",
            "document_type": "lecture_slide",
            "rights": {"usage_status": "confirmed", "ai_processing_allowed": True},
            "acl": {"allowed_roles": ["student"], "allowed_groups": [], "download_allowed": True},
            "integrity": {"type": "learning_material", "assigned_by": "teacher_001"},
        }
    }

    metadata = resolve_metadata(_record(), defaults)

    assert metadata.metadata_status == "valid"
    assert metadata.document.course_id == "MATH101"
    validate_resolved_metadata(metadata)


def test_document_override_wins_over_course_default():
    defaults = {
        "MATH101": {
            "owner_id": "teacher_001",
            "document_type": "lecture_slide",
            "rights": {"usage_status": "confirmed"},
            "acl": {"allowed_roles": ["student"]},
            "integrity": {"type": "learning_material"},
        }
    }
    override = {"integrity": {"type": "graded_assignment", "assessment_id": "A1"}}

    metadata = resolve_metadata(_record("assignment.pdf"), defaults, override)

    assert metadata.integrity.type == "graded_assignment"
    assert "integrity_type_requires_confirmation" in metadata.metadata_warnings


def test_confirmed_metadata_wins_for_business_fields():
    defaults = {
        "MATH101": {
            "owner_id": "teacher_001",
            "document_type": "lecture_slide",
            "rights": {"usage_status": "confirmed"},
            "acl": {"allowed_roles": ["student"]},
            "integrity": {"type": "learning_material"},
        }
    }
    override = {"title": "Override title"}
    confirmed = {"title": "Confirmed title", "owner_id": "teacher_confirmed"}

    metadata = resolve_metadata(_record(), defaults, override, confirmed)

    assert metadata.document.title == "Confirmed title"
    assert metadata.document.owner_id == "teacher_confirmed"


def test_technical_metadata_is_not_overridden_by_business_metadata():
    defaults = {"MATH101": {"owner_id": "teacher_001", "document_type": "lecture_slide"}}
    override = {"sha256": "b" * 64, "mime_type": "text/plain", "size_bytes": 999}

    metadata = resolve_metadata(_record(), defaults, override)

    assert metadata.version.checksum == "a" * 64
    assert metadata.version.mime_type == "application/pdf"
    assert metadata.version.size_bytes == 12


def test_filename_answer_only_creates_unconfirmed_suggestion():
    metadata = resolve_metadata(_record("answer_assignment.pdf"), {"MATH101": {}})

    assert metadata.suggestions["document_type"].value == "answer_key"
    assert metadata.suggestions["document_type"].confirmed is False
    assert metadata.integrity.type == "restricted"
