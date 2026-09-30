from __future__ import annotations

from src.ingestion.chunking.structure import Chunk
from src.ingestion.models.document import DocumentACL, DocumentState, DocumentVersion


def build_index_records(chunks: list[Chunk]) -> list[dict]:
    return [
        {
            "chunk_id": chunk.id,
            "document_id": chunk.document_id,
            "version_id": chunk.version_id,
            "course_id": chunk.course_id,
            "document_type": chunk.document_type,
            "locator": chunk.locator.model_dump(),
            "source_revision": chunk.source_revision,
            "quality_flags": chunk.quality_flags,
        }
        for chunk in chunks
    ]


def verify_publish_index_ready(version: DocumentVersion, acl: DocumentACL, metadata_valid: bool) -> None:
    if version.state != DocumentState.APPROVED:
        raise ValueError("Only Approved document versions can enter production indexing")
    if not acl.is_valid_for_serving:
        raise ValueError("Cannot publish index without valid ACL")
    if not metadata_valid:
        raise ValueError("Cannot publish index with invalid metadata")
