from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from pydantic import ValidationError

from src.ingestion.inventory.scanner import InventoryRecord
from src.ingestion.metadata.schema import MetadataSuggestion, ResolvedMetadata
from src.ingestion.models.document import Document, DocumentACL, DocumentState, DocumentVersion, IntegrityLabel

DOCUMENT_TYPES = {
    "lecture_slide",
    "syllabus",
    "reading",
    "assignment",
    "exam",
    "solution",
    "answer_key",
    "other",
}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def _stable_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return slug or "document"


def _suggestions(record: InventoryRecord) -> dict[str, MetadataSuggestion]:
    suggestions: dict[str, MetadataSuggestion] = {}
    lower_name = record.filename.lower()
    if "answer" in lower_name or "dap_an" in lower_name or "đáp" in lower_name:
        suggestions["document_type"] = MetadataSuggestion(value="answer_key", source="filename", confirmed=False)
    return suggestions


def resolve_metadata(
    inventory_record: InventoryRecord,
    course_defaults: dict[str, dict[str, Any]],
    document_override: dict[str, Any] | None = None,
    confirmed_metadata: dict[str, Any] | None = None,
) -> ResolvedMetadata:
    if not inventory_record.course_id:
        raise ValueError(f"Cannot resolve metadata without course_id: {inventory_record.relative_path}")
    if not inventory_record.sha256:
        raise ValueError(f"Cannot resolve metadata without checksum: {inventory_record.relative_path}")

    business = deepcopy(course_defaults.get(inventory_record.course_id, {}))
    business = _deep_merge(business, document_override or {})
    business = _deep_merge(business, confirmed_metadata or {})

    title = business.get("title") or inventory_record.filename
    document_type = business.get("document_type")
    path_slug = _stable_slug(inventory_record.relative_path)
    checksum_short = inventory_record.sha256[:12]
    document_id = business.get("document_id") or f"doc_{inventory_record.course_id.lower()}_{path_slug}"
    version_id = business.get("version_id") or f"ver_{inventory_record.course_id.lower()}_{checksum_short}_r1"

    source = business.get("source") or {}
    rights = business.get("rights") or {}
    acl = business.get("acl") or {}
    integrity = business.get("integrity") or {}

    document = Document(
        id=document_id,
        course_id=inventory_record.course_id,
        owner_id=business.get("owner_id"),
        title=title,
        current_version_id=version_id,
        document_type=document_type,
        author=business.get("author"),
        provider=source.get("provider"),
        language=business.get("language"),
        academic=business.get("academic") or {},
    )
    version = DocumentVersion(
        id=version_id,
        document_id=document_id,
        version=str(business.get("version", "1.0")),
        checksum=inventory_record.sha256,
        storage_key=business.get("storage_key") or inventory_record.relative_path,
        state=DocumentState.PROCESSING,
        revision=int(business.get("revision", 1)),
        filename=inventory_record.filename,
        mime_type=inventory_record.mime_type,
        size_bytes=inventory_record.size_bytes,
        source=source,
        rights=rights,
        ingestion_config_version=str(business.get("ingestion_config_version", "ingestion_v1")),
    )
    document_acl = DocumentACL(
        version_id=version_id,
        allowed_roles=acl.get("allowed_roles") or [],
        allowed_groups=acl.get("allowed_groups") or [],
        download_allowed=bool(acl.get("download_allowed", False)),
    )
    integrity_label = IntegrityLabel(
        version_id=version_id,
        type=integrity.get("type") or "restricted",
        assessment_id=integrity.get("assessment_id"),
        effective_period=integrity.get("effective_period") or {},
        assigned_by=integrity.get("assigned_by"),
    )

    missing: list[str] = []
    warnings: list[str] = list(inventory_record.warnings)
    if not document.owner_id:
        missing.append("owner_id")
    if not document.title:
        missing.append("title")
    if not document_type or document_type not in DOCUMENT_TYPES:
        missing.append("document_type")
    if rights.get("usage_status") not in {"confirmed", "unknown", "restricted"}:
        missing.append("rights.usage_status")
    if not document_acl.is_valid_for_serving:
        warnings.append("acl_empty_deny_by_default")
    if rights.get("usage_status") != "confirmed":
        warnings.append("rights_not_confirmed")
    if integrity_label.type in {"graded_assignment", "exam", "solution", "answer_key", "restricted"}:
        warnings.append("integrity_type_requires_confirmation")

    metadata_status = "valid" if not missing and not warnings else "needs_review"
    return ResolvedMetadata(
        document=document,
        version=version,
        acl=document_acl,
        integrity=integrity_label,
        metadata_status=metadata_status,
        missing_required_fields=missing,
        metadata_warnings=warnings,
        suggestions=_suggestions(inventory_record),
    )


def validate_resolved_metadata(metadata: ResolvedMetadata) -> None:
    errors: list[str] = []
    if metadata.document.document_type not in DOCUMENT_TYPES:
        errors.append("document_type invalid or missing")
    if not metadata.version.checksum:
        errors.append("version checksum missing")
    if not metadata.version.version:
        errors.append("version value missing")
    if not metadata.acl.is_valid_for_serving:
        errors.append("ACL has no allowed roles or groups")
    try:
        IntegrityLabel.model_validate(metadata.integrity.model_dump(by_alias=True))
    except ValidationError as exc:
        errors.append(str(exc))
    if errors:
        raise ValueError("; ".join(errors))
