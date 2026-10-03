"""Integration regressions for scoped chat, protected sources and processing progress.
No external LLM/embedding requests or production database access.
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from src.api.deps import current_user
from src.db import Base, _migrate_conversation_document, get_db
from src.main import app
from src.models.orm import Approval, Chunk, Course, Document, DocumentVersion, IngestionJob, Membership, Message, User
from src.services import conversations, documents, page_render, retrieval
from src.services.assistants import AssistantResult, LlmError


@pytest.fixture
def setup():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        student = User(id="student", login_id="student", display_name="Student", role="student", password_hash="unused")
        teacher = User(
            id="teacher", login_id="teacher", display_name="Teacher", role="lecturer", password_hash="unused"
        )
        stranger = User(
            id="stranger", login_id="stranger", display_name="Stranger", role="student", password_hash="unused"
        )
        db.add_all([student, teacher, stranger, Course(id="course", name="Course", status="active")])
        db.flush()
        db.add_all(
            [
                Membership(user_id="student", course_id="course", can_read=True),
                Membership(user_id="teacher", course_id="course", can_upload=True),
            ]
        )
        for n in (1, 2):
            doc = Document(id=f"doc{n}", course_id="course", owner_id="teacher", title=f"Book {n}", doc_type="textbook")
            db.add(doc)
            db.flush()
            v = DocumentVersion(
                id=f"ver{n}",
                document_id=doc.id,
                version_label="1",
                state="Published",
                file_type="pdf",
                original_filename="book.pdf",
                checksum=str(n),
                storage_key="test",
                size_bytes=100,
                page_count=2,
                provenance="test",
                usage_permission="confirmed",
                acl_roles=["student", "lecturer"],
                download_allowed=False,
                integrity_label="learning_material",
                uploader_id="teacher",
            )
            db.add(v)
            doc.current_version_id = v.id
            db.flush()
            db.add(
                Chunk(
                    id=f"chunk{n}",
                    version_id=v.id,
                    ordinal=1,
                    locator_type="page",
                    locator_value=2,
                    text=f"Private content from book {n}",
                    embedding=retrieval.to_blob([1, 0]),
                )
            )
        db.commit()
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[current_user] = lambda: student
        client = TestClient(app)  # No lifespan: never initialize production database/jobs.
        try:
            yield client, db, student, teacher, stranger
        finally:
            client.close()
            app.dependency_overrides.clear()
            retrieval._cache.clear()
    engine.dispose()


def fake_answer(monkeypatch, db):
    def run(**kwargs):
        allowed = retrieval.servable_versions(db, kwargs["user"], "course")
        v, d = allowed[0]
        chunk = db.get(Chunk, "chunk1")
        return AssistantResult(
            status="answered", content="Private answer [1]", used=[(1, retrieval.Hit(chunk, v, d, 1))]
        ), {"assistant": "academic", "course_id": "course"}

    monkeypatch.setattr(conversations.orchestrator, "run", run)


def test_scoped_chat_and_scope_reset(setup, monkeypatch):
    client, db, student, *_ = setup
    response = client.post("/api/v1/conversations", json={"document_id": "doc1", "assistant": "academic"})
    assert response.status_code == 201
    conv = response.json()
    assert conv["document_id"] == "doc1" and conv["course_id"] == "course"

    def run(**kwargs):
        assert [d.id for _, d in retrieval.servable_versions(db, student, "course")] == ["doc1"]
        return AssistantResult(status="answered", content="Scoped"), {"assistant": "academic", "course_id": "course"}

    monkeypatch.setattr(conversations.orchestrator, "run", run)
    assert client.post(f"/api/v1/conversations/{conv['id']}/messages", json={"content": "Question"}).status_code == 200
    assert len(retrieval.servable_versions(db, student, "course")) == 2
    assert client.post("/api/v1/conversations", json={"document_id": "doc1", "course_id": "other"}).status_code == 422
    db.get(Document, "doc1").emergency_locked = True
    db.commit()
    assert client.post(f"/api/v1/conversations/{conv['id']}/messages", json={"content": "Again"}).status_code == 410


def test_scope_propagates_through_real_agent_graph(setup, monkeypatch):
    from src.services.assistants import academic

    client, db, student, *_ = setup

    def answer(db, user, course_id, question, history, **kwargs):
        assert [d.id for _, d in retrieval.servable_versions(db, user, course_id)] == ["doc2"]
        return AssistantResult(status="answered", content="Only book two")

    monkeypatch.setattr(academic, "answer", answer)
    conv = client.post("/api/v1/conversations", json={"document_id": "doc2"}).json()["id"]
    response = client.post(
        f"/api/v1/conversations/{conv}/messages", json={"content": "Explain a concept", "assistant": "academic"}
    )
    assert response.status_code == 200 and response.json()["content"] == "Only book two"
    assert len(retrieval.servable_versions(db, student, "course")) == 2


def test_unreadable_or_draft_scope_denied(setup):
    client, db, _, _, stranger = setup
    app.dependency_overrides[current_user] = lambda: stranger
    assert client.post("/api/v1/conversations", json={"document_id": "doc1"}).status_code == 404
    app.dependency_overrides[current_user] = lambda: db.get(User, "student")
    db.get(DocumentVersion, "ver1").state = "Draft"
    db.commit()
    assert client.post("/api/v1/conversations", json={"document_id": "doc1"}).status_code == 410


@pytest.mark.parametrize("revocation", ["withdraw", "lock", "membership", "replace", "acl"])
def test_replay_history_and_sources_reauthorize(setup, monkeypatch, revocation):
    client, db, student, _, stranger = setup
    fake_answer(monkeypatch, db)
    conv = client.post("/api/v1/conversations", json={"course_id": "course"}).json()["id"]
    path = f"/api/v1/conversations/{conv}/messages"
    body, headers = {"content": "Question"}, {"Idempotency-Key": "request-1"}
    first = client.post(path, json=body, headers=headers)
    assert first.status_code == 200
    citation = first.json()["citations"][0]["citation_id"]
    if revocation == "withdraw":
        db.get(DocumentVersion, "ver1").state = "Withdrawn"
    elif revocation == "lock":
        db.get(Document, "doc1").emergency_locked = True
    elif revocation == "membership":
        db.scalar(select(Membership).where(Membership.user_id == student.id)).can_read = False
    elif revocation == "replace":
        db.get(Document, "doc1").current_version_id = None
    else:
        db.get(DocumentVersion, "ver1").acl_roles = ["lecturer"]
    db.commit()
    replay = client.post(path, json=body, headers=headers)
    assert replay.status_code == 200
    assert replay.json()["metadata"]["masked"] is True
    assert "Private answer" not in replay.text and replay.json()["citations"] == []
    assert "Private answer" not in client.get(path).text
    assert "Private answer" not in str(conversations._history(db, conversations.get_owned(db, student, conv), "future"))
    assert client.get(f"/api/v1/citations/{citation}/source").status_code == 410
    assert client.get("/api/v1/documents/doc1/versions/ver1/pages/2/image").status_code in (404, 410)
    app.dependency_overrides[current_user] = lambda: stranger
    assert client.post(path, json=body, headers=headers).status_code == 404
    app.dependency_overrides[current_user] = lambda: student
    client.delete(f"/api/v1/conversations/{conv}")
    assert client.post(path, json=body, headers=headers).status_code == 404


def test_source_page_exact_and_no_original_download(setup, monkeypatch):
    client, db, student, _, stranger = setup
    calls = []
    monkeypatch.setattr(page_render, "render_png", lambda key, page, width: calls.append((key, page, width)) or b"PNG")
    path = "/api/v1/documents/doc1/versions/ver1"
    response = client.get(path + "/pages/2/image")
    assert response.status_code == 200 and response.headers["content-type"] == "image/png"
    assert calls == [("test", 2, 1000)]
    assert response.headers["cache-control"] == "private, no-store"
    assert client.get(path + "/download").status_code == 404  # read != download
    assert client.get(path + "/pages?page_from=2&page_to=2").json()["pages"][0]["page"] == 2
    app.dependency_overrides[current_user] = lambda: stranger
    assert client.get(path + "/pages/2/image").status_code == 404
    del app.dependency_overrides[current_user]
    assert client.get(path + "/download").status_code == 401
    assert client.get(path + "/pages/2/image").status_code == 401


def test_knowledge_hub_backend_uses_hybrid_core_and_exact_source(setup, monkeypatch):
    from src.services.knowledge_hub_database import ConfiguredQueryEmbeddingProvider

    client, db, *_ = setup
    chunk = db.get(Chunk, "chunk1")
    chunk.section = "Architecture > Layered design"
    chunk.text = "Layered design separates responsibilities.\nA second page discusses trade-offs."
    chunk.page_map = [[0, 2], [42, 3]]
    db.commit()
    monkeypatch.setattr(ConfiguredQueryEmbeddingProvider, "embed_query", lambda _self, _text: [1.0, 0.0])

    response = client.get(
        "/api/v1/knowledge-hub/search",
        params={"course_id": "course", "q": "layered design", "page_size": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "hybrid"
    assert body["trace"]["vector_candidate_count"] == 2
    item = next(item for item in body["items"] if item["chunk_id"] == "chunk1")
    assert item["locator"] == {
        "type": "page",
        "value": 2,
        "end": 3,
        "section": "Architecture > Layered design",
    }
    assert item["citation"]["document_id"] == "doc1"
    assert item["citation"]["version_id"] == "ver1"
    assert item["citation"]["quote"] == chunk.text

    library = client.get("/api/v1/documents", params={"course_id": "course", "q": "layered design"})
    assert library.status_code == 200 and library.json()["mode"] == "hybrid"
    source = client.get("/api/v1/chunks/chunk1/source").json()
    assert source["chunk_id"] == "chunk1"
    assert source["locator"] == item["locator"]
    assert source["excerpt"] == chunk.text

    conversation_id = client.post("/api/v1/conversations", json={"course_id": "course", "assistant": "hub"}).json()[
        "conversation_id"
    ]
    message = client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={"content": "Tìm tài liệu layered design", "assistant": "hub"},
    )
    assert message.status_code == 200
    result = next(row for row in message.json()["metadata"]["results"] if row["chunk_id"] == "chunk1")
    assert result["citation"]["locator"] == item["locator"]


def test_source_render_errors_are_safe(setup, monkeypatch):
    client, db, *_ = setup
    path = "/api/v1/documents/doc1/versions/ver1/pages/2/image"

    def broken(*args):
        raise RuntimeError("private storage path")

    monkeypatch.setattr(page_render, "render_png", broken)
    response = client.get(path)
    assert response.status_code == 502 and response.json()["error"]["retryable"]
    assert "private storage path" not in response.text

    def out_of_range(*args):
        raise page_render.PageOutOfRangeError()

    monkeypatch.setattr(page_render, "render_png", out_of_range)
    assert client.get(path).status_code == 404
    db.get(DocumentVersion, "ver1").file_type = "pptx"
    db.commit()
    assert client.get(path).status_code == 409


@pytest.mark.parametrize(
    "failure,code",
    [
        (retrieval.EmbeddingUnavailableError(True), "EMBEDDING_RATE_LIMITED"),
        (retrieval.EmbeddingUnavailableError(False), "EMBEDDING_UNAVAILABLE"),
        (LlmError("timeout"), "LLM_UNAVAILABLE"),
    ],
)
def test_provider_errors_are_retryable_without_success_message(setup, monkeypatch, failure, code):
    client, db, *_ = setup

    def fail(**kwargs):
        raise failure

    monkeypatch.setattr(conversations.orchestrator, "run", fail)
    conv = client.post("/api/v1/conversations", json={"document_id": "doc1"}).json()["id"]
    response = client.post(f"/api/v1/conversations/{conv}/messages", json={"content": "Question"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == code and response.json()["error"]["retryable"]
    assert list(db.scalars(select(Message.role))) == ["user"]
    assert retrieval._document_scope.get() is None


def test_progress_and_retry_preserve_embeddings(setup, monkeypatch):
    client, db, _, teacher, _ = setup
    assert client.get("/api/v1/manage/versions?course_id=course").status_code == 403
    app.dependency_overrides[current_user] = lambda: teacher
    version = db.get(DocumentVersion, "ver1")
    version.state = "Failed"
    db.add(Chunk(id="extra", version_id=version.id, ordinal=2, locator_type="page", locator_value=2, text="Remaining"))
    db.add(
        Approval(version_id=version.id, reviewed_revision=version.revision, reviewer_id="teacher", decision="approve")
    )
    db.add(
        IngestionJob(
            id="oldjob",
            version_id=version.id,
            kind="index",
            status="failed",
            stage="embedding",
            progress=0.5,
            error_code="EMBEDDING_RATE_LIMITED",
        )
    )
    db.commit()
    view = client.get("/api/v1/review/versions/ver1/preview").json()["version"]
    assert (view["chunk_count"], view["embedded_count"]) == (2, 1)
    assert view["job"]["error_code"] == "EMBEDDING_RATE_LIMITED"
    started = []
    monkeypatch.setattr(documents, "start_job", started.append)
    response = client.post("/api/v1/versions/ver1/retry")
    assert response.status_code == 200 and started == [response.json()["job_id"]]
    embedded = []

    def embed(texts):
        embedded.extend(texts)
        return [retrieval.to_blob([1, 0]) for _ in texts]

    monkeypatch.setattr(retrieval, "embed_texts", embed)
    job = db.get(IngestionJob, response.json()["job_id"])
    documents._run_index(db, job, version)
    db.commit()
    assert embedded == ["Remaining"]
    assert version.state == "Published" and job.progress == 1
    assert client.get("/api/v1/review/versions/ver1/preview").json()["version"]["embedded_count"] == 2


def test_reprocess_prechunked_keeps_published_version_until_index(setup):
    _, db, _, teacher, _ = setup
    old = db.get(DocumentVersion, "ver1")
    document = db.get(Document, "doc1")

    replacement = documents.reprocess_prechunked(
        db,
        teacher,
        old.id,
        reason="section-aware rebuild",
        page_count=3,
        chunks=[
            {
                "page": 2,
                "section": "Architecture > Layers",
                "text": "Layered architecture separates responsibilities.",
                "page_map": [[0, 2]],
            },
            {
                "page": 3,
                "section": "Architecture > Trade-offs",
                "text": "Extra layers can add latency.",
                "page_map": [[0, 3]],
            },
        ],
        source="artifacts/chunks_sectioned/example.json",
    )

    assert replacement.id != old.id
    assert replacement.state == "Draft"
    assert replacement.document_id == old.document_id
    assert replacement.storage_key == old.storage_key
    assert replacement.page_count == 3
    assert document.current_version_id == old.id
    assert old.state == "Published"
    chunks = list(db.scalars(select(Chunk).where(Chunk.version_id == replacement.id).order_by(Chunk.ordinal)))
    assert [(chunk.section, chunk.locator_value) for chunk in chunks] == [
        ("Architecture > Layers", 2),
        ("Architecture > Trade-offs", 3),
    ]
    assert all(chunk.embedding is None for chunk in chunks)


def test_document_scope_migration_preserves_rows_and_is_repeatable():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE conversations (id VARCHAR(40) PRIMARY KEY, title VARCHAR(300))")
        conn.exec_driver_sql("INSERT INTO conversations VALUES ('old', 'Keep me')")
    _migrate_conversation_document(engine)
    _migrate_conversation_document(engine)
    with engine.connect() as conn:
        assert "document_id" in {c["name"] for c in inspect(conn).get_columns("conversations")}
        assert conn.exec_driver_sql("SELECT title, document_id FROM conversations").one() == ("Keep me", None)
    engine.dispose()


def test_real_pdf_page_render_and_range(tmp_path, monkeypatch):
    from pypdf import PdfWriter

    pdf = tmp_path / "source.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=500)
    writer.write(pdf)
    monkeypatch.setattr(page_render.storage, "path_of", lambda _: pdf)
    assert page_render.render_png("test", 1, 600).startswith(b"\x89PNG")
    with pytest.raises(page_render.PageOutOfRangeError):
        page_render.render_png("test", 2, 600)


def test_registration_cannot_choose_admin(setup, monkeypatch):
    from types import SimpleNamespace

    from src.api.auth import register
    from src.models.schemas import RegisterRequest

    _, db, *_ = setup

    class Auth:
        def login(self, db, login_id, password, ip):
            user = db.scalar(select(User).where(User.login_id == login_id))
            return "token", SimpleNamespace(expires_at=datetime.now(UTC)), user

    request = SimpleNamespace(client=SimpleNamespace(host="test"))
    result = register(RegisterRequest(login_id="new", password="test-password", role="admin"), request, db, Auth())
    assert result.user.role == "student"
