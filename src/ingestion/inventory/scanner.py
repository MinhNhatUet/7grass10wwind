from __future__ import annotations

from collections import Counter
from pathlib import Path

from pydantic import BaseModel, Field

from src.ingestion.course_registry import CourseRegistry, CourseRegistryError
from src.ingestion.inventory.checksum import sha256_file
from src.ingestion.inventory.mime import detect_mime_type, is_supported_mime


class InventoryRecord(BaseModel):
    relative_path: str
    course_id: str | None
    filename: str
    extension: str
    mime_type: str
    size_bytes: int
    sha256: str | None = None
    status: str = "discovered"
    warnings: list[str] = Field(default_factory=list)


def scan_corpus(root: str | Path, registry: CourseRegistry) -> list[InventoryRecord]:
    root_path = Path(root)
    records: list[InventoryRecord] = []
    for file_path in sorted(path for path in root_path.rglob("*") if path.is_file()):
        relative_path = file_path.relative_to(root_path).as_posix()
        parts = file_path.relative_to(root_path).parts
        warnings: list[str] = []
        course_id: str | None = None
        status = "discovered"

        if not parts:
            warnings.append("missing_course_folder")
        else:
            try:
                course_id = registry.resolve_folder(parts[0]).id
            except CourseRegistryError:
                warnings.append("unknown_course_folder")
                status = "needs_review"

        try:
            mime_type, mime_warnings = detect_mime_type(file_path)
            warnings.extend(mime_warnings)
            digest = sha256_file(file_path)
            size_bytes = file_path.stat().st_size
        except OSError as exc:
            mime_type = "application/octet-stream"
            digest = None
            size_bytes = 0
            status = "unreadable"
            warnings.append(f"unreadable_file:{exc}")

        if not is_supported_mime(mime_type):
            warnings.append("unsupported_file_type")
            if status == "discovered":
                status = "unsupported"

        records.append(
            InventoryRecord(
                relative_path=relative_path,
                course_id=course_id,
                filename=file_path.name,
                extension=file_path.suffix.lower(),
                mime_type=mime_type,
                size_bytes=size_bytes,
                sha256=digest,
                status=status,
                warnings=warnings,
            )
        )

    checksum_counts = Counter(record.sha256 for record in records if record.sha256)
    for record in records:
        if record.sha256 and checksum_counts[record.sha256] > 1:
            record.warnings.append("duplicate_checksum")
            if record.status == "discovered":
                record.status = "needs_review"
    return records
