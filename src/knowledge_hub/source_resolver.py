"""Source resolution with a fresh authorization/status check."""

from __future__ import annotations

from src.knowledge_hub.errors import ScopeDenied, SourceNotFound, SourceUnavailable
from src.knowledge_hub.interfaces import DocumentCatalog
from src.knowledge_hub.models import AccessScope, SourceView
from src.knowledge_hub.policies import can_download, is_version_readable
from src.knowledge_hub.snippets import build_locator, build_snippet


class SourceResolver:
    def __init__(self, catalog: DocumentCatalog, snippet_max_chars: int = 300) -> None:
        self._catalog = catalog
        self._snippet_max_chars = snippet_max_chars

    def resolve(self, version_id: str, chunk_id: str | None, access: AccessScope) -> SourceView:
        version = self._catalog.get_version(version_id)
        if version is None:
            raise SourceNotFound("version was not found")
        if version.course_id not in access.allowed_course_ids:
            raise ScopeDenied("source course is outside the resolved access scope")
        if access.allowed_version_ids is not None and version_id not in access.allowed_version_ids:
            raise ScopeDenied("version is outside the resolved access scope")
        if not is_version_readable(version, access):
            raise SourceUnavailable("source is not currently published and available")

        chunk = None
        if chunk_id is not None:
            chunk = self._catalog.get_chunk(chunk_id)
            if chunk is None or chunk.version_id != version_id:
                raise SourceNotFound("chunk was not found for the requested version")

        return SourceView(
            document_id=version.document_id,
            version_id=version.version_id,
            title=version.title,
            version_label=version.version_label,
            excerpt=build_snippet(chunk.text, self._snippet_max_chars) if chunk is not None else None,
            locator=build_locator(chunk) if chunk is not None else None,
            can_download=can_download(version, access),
        )
