from __future__ import annotations

from array import array

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from src.db import Base
from src.knowledge_hub import HubSearchRequest, RetrievalError, SearchFilters, SourceUnavailable
from src.models.orm import Chunk, Course, Document, DocumentVersion, Membership, User
from src.services.knowledge_hub_database import (
    SQLAlchemyBM25Store,
    SQLAlchemyVectorStore,
    build_database_hub,
    hub_response_view,
    resolve_database_access_scope,
    search_database,
)
from src.services.retrieval import document_scope


class FixedEmbeddingProvider:
    def __init__(self, vector: list[float] | None = None) -> None:
        self.vector = vector or [1.0, 0.0]
        self.call_count = 0

    def embed_query(self, text: str) -> list[float]:
        self.call_count += 1
        return self.vector


def _blob(values: list[float]) -> bytes:
    return array("f", values).tobytes()


def _add_document(
    db: Session,
    *,
    document_id: str,
    version_id: str,
    course_id: str = "SE101",
    title: str = "Cây AVL",
    state: str = "Published",
    current: bool = True,
    locked: bool = False,
    acl_roles: list[str] | None = None,
    integrity_label: str = "learning_material",
    text: str = "Cây AVL dùng phép quay để tự cân bằng.",
    vector: list[float] | None = None,
) -> None:
    document = Document(
        id=document_id,
        course_id=course_id,
        owner_id="teacher",
        title=title,
        doc_type="slide",
        current_version_id=version_id if current else None,
        emergency_locked=locked,
    )
    version = DocumentVersion(
        id=version_id,
        document_id=document_id,
        version_label="v1",
        state=state,
        file_type="pptx",
        original_filename=f"{document_id}.pptx",
        checksum=document_id,
        storage_key=document_id,
        size_bytes=100,
        page_count=10,
        provenance="test",
        usage_permission="confirmed",
        acl_roles=acl_roles or ["student", "lecturer"],
        download_allowed=True,
        integrity_label=integrity_label,
        chapter="5",
        uploader_id="teacher",
    )
    chunk = Chunk(
        id=f"chunk-{version_id}",
        version_id=version_id,
        ordinal=1,
        locator_type="slide",
        locator_value=7,
        section="Trees > AVL",
        text=text,
        embedding=_blob(vector or [1.0, 0.0]),
    )
    db.add_all([document, version, chunk])


@pytest.fixture
def database_setup():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        db.add_all(
            [
                Course(id="SE101", code="SE101", name="Software Engineering", status="active"),
                Course(id="DB101", code="DB101", name="Database", status="active"),
                User(
                    id="student",
                    login_id="student@test",
                    display_name="Student",
                    role="student",
                    status="active",
                    password_hash="unused",
                ),
                User(
                    id="teacher",
                    login_id="teacher@test",
                    display_name="Teacher",
                    role="lecturer",
                    status="active",
                    password_hash="unused",
                ),
                Membership(user_id="student", course_id="SE101", can_read=True, can_download=True),
            ]
        )
        _add_document(db, document_id="eligible", version_id="eligible-v1")
        _add_document(db, document_id="locked", version_id="locked-v1", locked=True)
        _add_document(db, document_id="old", version_id="old-v1", current=False)
        _add_document(
            db,
            document_id="restricted",
            version_id="restricted-v1",
            integrity_label="answer_key",
        )
        _add_document(
            db,
            document_id="database",
            version_id="database-v1",
            course_id="DB101",
            title="SQL",
            text="SQL relational database",
            vector=[0.0, 1.0],
        )
        db.commit()
    yield engine
    engine.dispose()


def test_database_scope_resolves_membership_acl_current_and_lock(database_setup):
    with Session(database_setup, expire_on_commit=False) as db:
        user = db.get(User, "student")
        access = resolve_database_access_scope(db, user)
    assert access.allowed_course_ids == frozenset({"SE101"})
    assert access.allowed_version_ids == frozenset({"eligible-v1"})
    assert access.downloadable_version_ids == frozenset({"eligible-v1"})


def test_database_browse_reads_real_orm_rows_without_embedding_call(database_setup):
    embedding = FixedEmbeddingProvider()
    with Session(database_setup, expire_on_commit=False) as db:
        hub, access = build_database_hub(db, db.get(User, "student"), embedding_provider=embedding)
        response = hub.search(
            HubSearchRequest(
                query="",
                course_id="SE101",
                filters=SearchFilters(document_type="slide", chapter="5"),
            ),
            access,
        )
    assert embedding.call_count == 0
    assert response.total == 1
    assert response.items[0].document_id == "eligible"
    assert response.items[0].can_download is True


def test_database_hybrid_uses_real_chunk_embedding_and_bm25(database_setup):
    embedding = FixedEmbeddingProvider()
    with Session(database_setup, expire_on_commit=False) as db:
        user = db.get(User, "student")
        vector_store = SQLAlchemyVectorStore(db)
        lexical_store = SQLAlchemyBM25Store(db)
        hub, access = build_database_hub(db, user, embedding_provider=embedding)
        hub._vector_store = vector_store
        hub._lexical_store = lexical_store
        response = hub.search(HubSearchRequest(query="cây AVL phép quay", course_id="SE101"), access)

    assert embedding.call_count == 1
    assert response.total == 1
    item = response.items[0]
    assert item.document_id == "eligible"
    assert item.chunk_id == "chunk-eligible-v1"
    assert item.locator is not None and item.locator.slide == 7
    assert item.locator.section == "Trees > AVL"
    assert vector_store.last_filter == lexical_store.last_filter
    assert vector_store.last_filter.allowed_version_ids == frozenset({"eligible-v1"})


def test_backend_view_contains_authoritative_citation_and_page_span(database_setup):
    with Session(database_setup, expire_on_commit=False) as db:
        chunk = db.get(Chunk, "chunk-eligible-v1")
        chunk.locator_type = "page"
        chunk.locator_value = 4
        chunk.page_map = [[0, 4], [20, 5]]
        chunk.section = "Trees > AVL rotations"
        chunk.text = "Exact source line one.\nExact source line two on the next page."
        hub, access = build_database_hub(
            db,
            db.get(User, "student"),
            embedding_provider=FixedEmbeddingProvider(),
        )
        response = hub.search(HubSearchRequest(query="AVL rotations", course_id="SE101"), access)
        view = hub_response_view(db, response, include_trace=True)

    item = view["items"][0]
    assert item["locator"] == {
        "type": "page",
        "value": 4,
        "end": 5,
        "section": "Trees > AVL rotations",
    }
    assert item["citation"]["chunk_id"] == "chunk-eligible-v1"
    assert item["citation"]["quote"] == "Exact source line one.\nExact source line two on the next page."
    assert item["citation"]["locator"] == item["locator"]
    assert view["trace"]["mode"] == "hybrid"


def test_database_source_rechecks_emergency_lock(database_setup):
    with Session(database_setup, expire_on_commit=False) as db:
        hub, access = build_database_hub(db, db.get(User, "student"), embedding_provider=FixedEmbeddingProvider())
        response = hub.search(HubSearchRequest(query="AVL", course_id="SE101"), access)
        assert response.items

        document = db.get(Document, "eligible")
        document.emergency_locked = True
        db.flush()
        with pytest.raises(SourceUnavailable):
            hub.resolve_source("eligible-v1", "chunk-eligible-v1", access)


def test_database_hub_preserves_conversation_document_scope(database_setup):
    with Session(database_setup, expire_on_commit=False) as db:
        _add_document(db, document_id="second", version_id="second-v1", title="Another AVL source")
        db.commit()
        with document_scope("eligible"):
            hub, access = build_database_hub(
                db,
                db.get(User, "student"),
                embedding_provider=FixedEmbeddingProvider(),
            )
            response = hub.search(HubSearchRequest(query="AVL", course_id="SE101"), access)

    assert access.allowed_version_ids == frozenset({"eligible-v1"})
    assert [item.document_id for item in response.items] == ["eligible"]


def test_search_database_function_supports_injected_session_and_embedding(database_setup):
    response = search_database(
        "AVL tự cân bằng",
        course_id="SE101",
        user_id="student",
        session_factory=lambda: Session(database_setup, expire_on_commit=False),
        embedding_provider=FixedEmbeddingProvider(),
    )
    assert response.total == 1
    assert response.items[0].title == "Cây AVL"


def test_query_embedding_dimension_mismatch_is_rejected(database_setup):
    with Session(database_setup, expire_on_commit=False) as db:
        hub, access = build_database_hub(
            db,
            db.get(User, "student"),
            embedding_provider=FixedEmbeddingProvider([1.0, 0.0, 0.0]),
        )
        with pytest.raises(RetrievalError, match="hybrid retrieval failed"):
            hub.search(HubSearchRequest(query="AVL", course_id="SE101"), access)
