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
    """Build bounded chunks without crossing MinerU heading boundaries.

    Heading hierarchy is represented as ``Parent > Child`` in ``Chunk.section``.
    Oversized sections may yield multiple chunks, but content from the next
    section is never pulled back into the previous chunk.
    """
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
    last_locator: int | None = None
    has_body = False
    heading_stack: list[tuple[int, str, str]] = []
    current_section: str | None = None
    locator_type = pages[0].locator.type if pages else "page"

    def reset_buffer() -> None:
        nonlocal current_text, current_elements, current_types, current_flags
        nonlocal start_locator, last_locator, has_body
        current_text = []
        current_elements = []
        current_types = []
        current_flags = set()
        start_locator = None
        last_locator = None
        has_body = False

    def ensure_section_context(page_number: int, include_heading_ids: bool = False) -> None:
        nonlocal start_locator, last_locator
        if current_text:
            return
        if current_section:
            current_text.append(current_section)
            if include_heading_ids:
                current_elements.extend(item[2] for item in heading_stack)
                current_types.extend(ElementType.TITLE.value for _ in heading_stack)
        start_locator = page_number
        last_locator = page_number

    def flush(end_number: int) -> None:
        if not has_body:
            reset_buffer()
            return
        text = "\n".join(part for part in current_text if part.strip()).strip()
        if not text:
            reset_buffer()
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
                section=current_section,
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
        reset_buffer()

    for page in pages:
        page_number = page.locator.number or page.locator.start or 1
        for element in page.elements:
            serialized = serialize_element(element)
            if not serialized.strip():
                continue
            if element.type == ElementType.TITLE:
                level = element.heading_level or 1
                next_stack = list(heading_stack)
                while next_stack and next_stack[-1][0] >= level:
                    next_stack.pop()
                next_stack.append((level, serialized.strip(), element.id))
                next_section = " > ".join(item[1] for item in next_stack)
                if next_section == current_section:
                    continue
                if has_body:
                    flush(last_locator or page_number)
                else:
                    reset_buffer()
                heading_stack = next_stack
                current_section = next_section
                ensure_section_context(page_number, include_heading_ids=True)
                current_flags.update(page.quality_flags)
                current_flags.update(element.quality_flags)
                continue
            if contains_unsafe_control_chars(serialized):
                current_flags.add(QualityFlag.CHUNK_CONTAINS_CONTROL_CHAR.value)
                serialized = replace_unsafe_control_chars(serialized)
            ensure_section_context(page_number)
            projected_tokens = _token_count("\n".join(current_text + [serialized]))
            if has_body and projected_tokens > max_tokens and element.type not in ATOMIC_WITH_CONTEXT:
                flush(last_locator or page_number)
                ensure_section_context(page_number)
            if start_locator is None:
                start_locator = page_number
            current_text.append(serialized)
            current_elements.append(element.id)
            current_types.append(element.type.value)
            current_flags.update(page.quality_flags)
            current_flags.update(element.quality_flags)
            has_body = True
            last_locator = page_number
            if _token_count("\n".join(current_text)) >= target_tokens and element.type not in ATOMIC_WITH_CONTEXT:
                flush(page_number)
    if pages and has_body:
        flush(last_locator or pages[-1].locator.number or pages[-1].locator.end or 1)
    return chunks
