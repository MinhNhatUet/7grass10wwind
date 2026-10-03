from src.models.orm import Chunk
from src.services.retrieval import chunk_embedding_text


def test_chunk_embedding_text_adds_section_without_changing_source_text():
    chunk = Chunk(
        id="c1",
        version_id="v1",
        ordinal=1,
        locator_type="page",
        locator_value=2,
        section="Thiết kế > Kiến trúc",
        text="Nội dung nguồn",
    )

    assert chunk_embedding_text(chunk) == "Section: Thiết kế > Kiến trúc\n\nNội dung nguồn"
    assert chunk.text == "Nội dung nguồn"
