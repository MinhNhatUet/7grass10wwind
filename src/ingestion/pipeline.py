from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from src.ingestion.chunking.chunker import build_chunks
from src.ingestion.course_registry import CourseRegistry
from src.ingestion.inventory.scanner import InventoryRecord, scan_corpus
from src.ingestion.metadata.resolver import resolve_metadata
from src.ingestion.models.page import ParsedDocument
from src.ingestion.parsers.base import BaseParser
from src.ingestion.parsers.mineru_parser import MinerUParser
from src.ingestion.parsers.pdf_parser import PDFNativeParser
from src.ingestion.parsers.pptx_parser import PPTXNativeParser


class IngestionPipelineError(RuntimeError):
    """Raised when ingestion cannot complete a requested stage."""


def default_parsers(artifact_root: str | Path = "artifacts", device: str = "auto") -> list[BaseParser]:
    return [
        MinerUParser(artifact_root=artifact_root, device=device),
        PDFNativeParser(artifact_root=artifact_root),
        PPTXNativeParser(),
    ]


def select_parser(
    mime_type: str,
    parsers: list[BaseParser] | None = None,
    artifact_root: str | Path = "artifacts",
    device: str = "auto",
) -> BaseParser:
    for parser in parsers or default_parsers(artifact_root=artifact_root, device=device):
        if parser.can_handle(mime_type):
            return parser
    raise IngestionPipelineError(f"No parser configured for MIME type: {mime_type}")


def parse_with_fallback(
    file_path: str | Path,
    version_id: str,
    mime_type: str,
    parsers: list[BaseParser] | None = None,
    artifact_root: str | Path = "artifacts",
    device: str = "auto",
) -> ParsedDocument:
    errors: list[str] = []
    for parser in parsers or default_parsers(artifact_root=artifact_root, device=device):
        if not parser.can_handle(mime_type):
            continue
        try:
            return parser.parse(file_path, version_id)
        except Exception as exc:
            errors.append(f"{type(parser).__name__}: {type(exc).__name__}: {exc}")
    raise IngestionPipelineError(f"No parser completed for {file_path}. Errors: {' | '.join(errors)}")


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def quality_report(version_id: str, parsed: ParsedDocument) -> dict[str, Any]:
    issues = [
        {"locator": page.locator.model_dump(), "flags": page.quality_flags}
        for page in parsed.pages
        if page.quality_flags
    ]
    return {
        "version_id": version_id,
        "page_count": sum(1 for page in parsed.pages if page.locator.type == "page"),
        "slide_count": sum(1 for page in parsed.pages if page.locator.type == "slide"),
        "warning_count": sum(len(page.quality_flags) for page in parsed.pages),
        "needs_review": bool(issues),
        "issues": issues,
    }


def ingest_record(
    record: InventoryRecord,
    raw_root: str | Path,
    course_defaults: dict[str, dict[str, Any]],
    document_override: dict[str, Any] | None = None,
    confirmed_metadata: dict[str, Any] | None = None,
    artifact_root: str | Path = "artifacts",
    parsers: list[BaseParser] | None = None,
    device: str = "auto",
) -> dict[str, Any]:
    metadata = resolve_metadata(record, course_defaults, document_override, confirmed_metadata)
    parsed = parse_with_fallback(
        file_path=Path(raw_root) / record.relative_path,
        version_id=metadata.version.id,
        mime_type=record.mime_type,
        parsers=parsers,
        artifact_root=artifact_root,
        device=device,
    )
    chunks = build_chunks(metadata.document, metadata.version, metadata.acl, metadata.integrity, parsed.pages)
    report = quality_report(metadata.version.id, parsed)

    artifacts = Path(artifact_root)
    write_json(
        artifacts / "pages" / f"{metadata.version.id}.json",
        [page.model_dump(mode="json") for page in parsed.pages],
    )
    write_json(
        artifacts / "chunks" / f"{metadata.version.id}.json",
        [chunk.model_dump(mode="json") for chunk in chunks],
    )
    write_json(artifacts / "quality_reports" / f"{metadata.version.id}.json", report)

    return {
        "metadata": metadata,
        "page_count": len(parsed.pages),
        "chunk_count": len(chunks),
        "quality_report": report,
    }


def inventory_for_path(raw_root: str | Path, file_path: str | Path, registry: CourseRegistry) -> InventoryRecord:
    root = Path(raw_root)
    target = Path(file_path)
    if not target.is_absolute():
        target = Path.cwd() / target
    target = target.resolve()
    root_resolved = root.resolve()
    try:
        relative = target.relative_to(root_resolved).as_posix()
    except ValueError as exc:
        raise IngestionPipelineError(f"{target} is not under raw root {root_resolved}") from exc

    records = scan_corpus(root, registry)
    for record in records:
        if record.relative_path == relative:
            return record
    raise IngestionPipelineError(f"File not found in scan results: {relative}")
