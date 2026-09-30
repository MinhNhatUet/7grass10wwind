from __future__ import annotations

from src.ingestion.chunking.serializers import serialize_element
from src.ingestion.chunking.structure import Chunk
from src.ingestion.models.document import Document, DocumentACL, DocumentVersion, IntegrityLabel
from src.ingestion.models.element import ElementType
from src.ingestion.models.page import Locator, PageIR
from src.ingestion.quality.flags import QualityFlag
from src.ingestion.quality.scorer import score_quality
from src.ingestion.quality.text_quality import contains_unsafe_control_chars, replace_unsafe_control_chars

ATOMIC_WITH_CONTEXT = {ElementType.FORMULA, ElementType.TABLE, ElementType.FIGURE, ElementType.CHART}


def _token_count(text: str) -> int:
    return len(text.split())


def build_chunks(
    document: Document,
    version: DocumentVersion,
    acl: DocumentACL,
    integrity: IntegrityLabel,
    pages: list[PageIR],
    target_tokens: int = 500,
    max_tokens: int = 800,
) -> list[Chunk]:
    if version.document_id != document.id:
        raise ValueError("Document/version boundary mismatch")
    if not acl.version_id == version.id or not integrity.version_id == version.id:
        raise ValueError("ACL/integrity boundary mismatch")

    chunks: list[Chunk] = []
    current_text: list[str] = []
    current_elements: list[str] = []
    current_types: list[str] = []
    current_flags: set[str] = set()
    start_locator: int | None = None
    locator_type = pages[0].locator.type if pages else "page"

    def flush(end_number: int) -> None:
        nonlocal current_text, current_elements, current_types, current_flags, start_locator
        text = "\n".join(part for part in current_text if part.strip()).strip()
        if not text:
            return
        if contains_unsafe_control_chars(text):
            current_flags.add(QualityFlag.CHUNK_CONTAINS_CONTROL_CHAR.value)
            text = replace_unsafe_control_chars(text)
        chunk_number = len(chunks) + 1
        chunks.append(
            Chunk(
                id=f"chunk_{version.id}_{chunk_number:05d}",
                document_id=document.id,
                version_id=version.id,
                course_id=document.course_id,
                document_type=document.document_type,
                title=document.title,
                locator=Locator(type=locator_type, start=start_locator or end_number, end=end_number),
                text=text,
                element_ids=current_elements,
                element_types=current_types,
                extraction_method="structured",
                extraction_quality=score_quality(sorted(current_flags)),
                quality_flags=sorted(current_flags),
                source_revision=version.revision,
            )
        )
        current_text = []
        current_elements = []
        current_types = []
        current_flags = set()
        start_locator = None

    for page in pages:
        page_number = page.locator.number or page.locator.start or 1
        for element in page.elements:
            serialized = serialize_element(element)
            if not serialized.strip():
                continue
            if contains_unsafe_control_chars(serialized):
                current_flags.add(QualityFlag.CHUNK_CONTAINS_CONTROL_CHAR.value)
                serialized = replace_unsafe_control_chars(serialized)
            projected_tokens = _token_count("\n".join(current_text + [serialized]))
            if current_text and projected_tokens > max_tokens and element.type not in ATOMIC_WITH_CONTEXT:
                flush(page_number)
            if start_locator is None:
                start_locator = page_number
            current_text.append(serialized)
            current_elements.append(element.id)
            current_types.append(element.type.value)
            current_flags.update(page.quality_flags)
            current_flags.update(element.quality_flags)
            if _token_count("\n".join(current_text)) >= target_tokens and element.type not in ATOMIC_WITH_CONTEXT:
                flush(page_number)
    if pages:
        flush(pages[-1].locator.number or pages[-1].locator.end or 1)
    return chunks
