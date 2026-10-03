"""Eligibility and data-level permission rules (BR-01/02/03/07/10/13)."""

from __future__ import annotations

from src.knowledge_hub.errors import InvalidRequest, ScopeDenied
from src.knowledge_hub.models import AccessScope, DocumentVersion, HubSearchRequest, RetrievalFilter


def _same(expected: str | None, actual: str | None) -> bool:
    return expected is None or (actual is not None and expected.casefold() == actual.casefold())


def build_eligibility_filter(request: HubSearchRequest, access: AccessScope) -> RetrievalFilter:
    course_id = request.course_id.strip()
    if not course_id:
        raise InvalidRequest("course_id is required")
    if course_id not in access.allowed_course_ids:
        raise ScopeDenied("course is outside the resolved access scope")
    filters = request.filters
    return RetrievalFilter(
        course_id=course_id,
        allowed_version_ids=(frozenset(access.allowed_version_ids) if access.allowed_version_ids is not None else None),
        document_type=filters.document_type,
        topic=filters.topic,
        chapter=filters.chapter,
        semester=filters.semester,
        version=filters.version,
    )


def version_rejection_reason(version: DocumentVersion, filters: RetrievalFilter) -> str | None:
    if version.course_id != filters.course_id:
        return "wrong_course"
    if not version.available:
        return "unavailable"
    if filters.exclude_withdrawn and version.withdrawn:
        return "withdrawn"
    if version.status != filters.required_status:
        return "not_published"
    if filters.allowed_version_ids is not None and version.version_id not in filters.allowed_version_ids:
        return "version_scope"
    if not _same(filters.document_type, version.document_type):
        return "document_type"
    if not _same(filters.topic, version.topic):
        return "topic"
    if not _same(filters.chapter, version.chapter):
        return "chapter"
    if not _same(filters.semester, version.semester):
        return "semester"
    if not _same(filters.version, version.version_label):
        return "version"
    return None


def is_version_eligible(version: DocumentVersion, filters: RetrievalFilter) -> bool:
    return version_rejection_reason(version, filters) is None


def is_version_readable(version: DocumentVersion, access: AccessScope) -> bool:
    if version.course_id not in access.allowed_course_ids:
        return False
    if access.allowed_version_ids is not None and version.version_id not in access.allowed_version_ids:
        return False
    return version.available and version.status == "Published" and not version.withdrawn


def can_download(version: DocumentVersion, access: AccessScope) -> bool:
    downloadable = access.downloadable_version_ids
    return (
        is_version_readable(version, access)
        and downloadable is not None
        and version.version_id in downloadable
        and version.can_download_default
    )
