from __future__ import annotations

from typing import Any, Protocol

from src.ingestion.chunking.structure import Chunk


class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str], config: dict[str, Any]) -> list[list[float]]: ...


def embed_chunks(
    chunks: list[Chunk], embedding_config: dict[str, Any], provider: EmbeddingProvider
) -> list[dict[str, Any]]:
    texts = [f"Section: {chunk.section}\n\n{chunk.text}" if chunk.section else chunk.text for chunk in chunks]
    vectors = provider.embed(texts, embedding_config)
    if len(vectors) != len(chunks):
        raise ValueError("Embedding provider returned vector count mismatch")
    return [
        {"chunk_id": chunk.id, "vector": vector, "metadata": chunk.model_dump()}
        for chunk, vector in zip(chunks, vectors)
    ]
