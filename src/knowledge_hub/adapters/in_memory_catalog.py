"""Mutable catalog used to exercise revocation and stale-index behavior."""

from __future__ import annotations

from src.knowledge_hub.models import Chunk, DocumentVersion, RetrievalFilter
from src.knowledge_hub.policies import is_version_eligible


class InMemoryDocumentCatalog:
    def __init__(self, versions: list[DocumentVersion], chunks: list[Chunk]) -> None:
        self._versions = {version.version_id: version for version in versions}
        self._chunks = {chunk.chunk_id: chunk for chunk in chunks}
        self.last_filter: RetrievalFilter | None = None

    def list_versions(self, filters: RetrievalFilter) -> list[DocumentVersion]:
        self.last_filter = filters
        return [version for version in self._versions.values() if is_version_eligible(version, filters)]

    def get_version(self, version_id: str) -> DocumentVersion | None:
        return self._versions.get(version_id)

    def get_chunk(self, chunk_id: str) -> Chunk | None:
        return self._chunks.get(chunk_id)

    def upsert_version(self, version: DocumentVersion) -> None:
        self._versions[version.version_id] = version

    def upsert_chunk(self, chunk: Chunk) -> None:
        self._chunks[chunk.chunk_id] = chunk
