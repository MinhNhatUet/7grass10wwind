"""Fixture loader and ready-to-run core composition for demos/tests."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

from src.knowledge_hub.adapters import (
    FakeEmbeddingProvider,
    FakeReranker,
    InMemoryBM25Store,
    InMemoryDocumentCatalog,
    InMemoryVectorStore,
)
from src.knowledge_hub.agent import KnowledgeHubAgent
from src.knowledge_hub.config import HubConfig
from src.knowledge_hub.models import AccessScope, Chunk, DocumentVersion
from src.knowledge_hub.retrieval import ReciprocalRankFusion

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "knowledge_hub"


def load_fixture_data(fixture_dir: Path = FIXTURE_DIR) -> tuple[list[DocumentVersion], list[Chunk]]:
    with (fixture_dir / "documents.json").open(encoding="utf-8") as file:
        versions = [DocumentVersion(**item) for item in json.load(file)]
    with (fixture_dir / "chunks.json").open(encoding="utf-8") as file:
        chunks = [Chunk(**item) for item in json.load(file)]
    return versions, chunks


def demo_access_scope() -> AccessScope:
    return AccessScope(
        user_id="demo-student",
        allowed_course_ids={"ctdl"},
        allowed_version_ids={"avl-v1", "avl-v2", "bst-v1", "sorting-v1", "pending-v1"},
        downloadable_version_ids={"avl-v2", "bst-v1"},
    )


def build_demo_hub(
    *,
    reranker_fail: bool = False,
    config: HubConfig | None = None,
) -> tuple[KnowledgeHubAgent, dict[str, object]]:
    versions, chunks = load_fixture_data()
    catalog = InMemoryDocumentCatalog(versions, chunks)

    # The index deliberately has stale status for avl-v1. Catalog post-validation must still reject it.
    index_versions = [
        replace(version, status="Published", withdrawn=False) if version.version_id == "avl-v1" else version
        for version in versions
    ]
    embedding = FakeEmbeddingProvider()
    embeddings = {chunk.chunk_id: embedding.embed_document(chunk.text) for chunk in chunks}
    vector_store = InMemoryVectorStore(chunks, index_versions, embeddings)
    lexical_store = InMemoryBM25Store(chunks, index_versions)
    reranker = FakeReranker(
        scores={
            "c-avl-rotations": 0.99,
            "c-avl-definition": 0.91,
            "c-avl-balance": 0.89,
            "c-bst-definition": 0.30,
        },
        fail=reranker_fail,
    )
    hub_config = config or HubConfig()
    hub = KnowledgeHubAgent(
        catalog=catalog,
        vector_store=vector_store,
        lexical_store=lexical_store,
        embedding_provider=embedding,
        fusion_strategy=ReciprocalRankFusion(hub_config.rrf_k),
        reranker=reranker,
        config=hub_config,
    )
    dependencies: dict[str, object] = {
        "catalog": catalog,
        "embedding": embedding,
        "vector_store": vector_store,
        "lexical_store": lexical_store,
        "reranker": reranker,
    }
    return hub, dependencies
