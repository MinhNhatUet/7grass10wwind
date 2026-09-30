from __future__ import annotations

from typing import Any, Protocol

from src.ingestion.chunking.structure import Chunk


class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str], config: dict[str, Any]) -> list[list[float]]:
        ...


def embed_chunks(chunks: list[Chunk], embedding_config: dict[str, Any], provider: EmbeddingProvider) -> list[dict[str, Any]]:
    vectors = provider.embed([chunk.text for chunk in chunks], embedding_config)
    if len(vectors) != len(chunks):
        raise ValueError("Embedding provider returned vector count mismatch")
    return [{"chunk_id": chunk.id, "vector": vector, "metadata": chunk.model_dump()} for chunk, vector in zip(chunks, vectors)]
