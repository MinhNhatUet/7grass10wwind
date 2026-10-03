"""BL-13/14, FR-08, BR-01/07: withdrawal wins over stale index workers.

Independent sessions on a temporary SQLite database; no provider or production DB.
"""

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from src.db import Base
from src.models.orm import (
    Approval,
    AuditEvent,
    Chunk,
    Course,
    Document,
    DocumentVersion,
    IngestionJob,
    Membership,
    User,
)
from src.services import documents, retrieval
from src.services.errors import AppError


@pytest.fixture
def index_db(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'index.db').as_posix()}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as db:
        db.add_all(
            [
                Course(id="course", name="Course", status="active"),
                User(id="teacher", login_id="teacher", display_name="Teacher", role="lecturer", password_hash="unused"),
                User(
                    id="reviewer", login_id="reviewer", display_name="Reviewer", role="reviewer", password_hash="unused"
                ),
            ]
        )
        db.flush()
        db.add(Membership(user_id="reviewer", course_id="course", can_review=True))
        db.add(Document(id="doc", course_id="course", owner_id="teacher", title="Book", doc_type="textbook"))
        db.flush()
        db.add(
            DocumentVersion(
                id="version",
                document_id="doc",
                version_label="1",
                state="Approved",
                revision=1,
                file_type="pdf",
                original_filename="book.pdf",
                checksum="test",
                storage_key="test",
                size_bytes=100,
                provenance="test",
                usage_permission="confirmed",
                acl_roles=["student", "lecturer", "reviewer"],
                integrity_label="learning_material",
                uploader_id="teacher",
            )
        )
        db.flush()
        db.add_all(
            [
                Chunk(
                    id="chunk", version_id="version", ordinal=1, locator_type="page", locator_value=1, text="Evidence"
                ),
                Approval(version_id="version", reviewer_id="reviewer", reviewed_revision=1, decision="approve"),
                IngestionJob(id="job", version_id="version", kind="index", status="running"),
                IngestionJob(id="queued", version_id="version", kind="index"),
            ]
        )
        db.commit()
    try:
        yield factory
    finally:
        engine.dispose()
        retrieval._cache.clear()


def withdraw(factory):
    with factory() as reviewer_db:
        return documents.withdraw(
            reviewer_db, reviewer_db.get(User, "reviewer"), "version", "Invalid source", None
        ).revision


def assert_withdrawn(factory):
    with factory() as db:
        version = db.get(DocumentVersion, "version")
        assert version.state == "Withdrawn" and version.revision == 2
        assert db.get(Document, "doc").current_version_id is None
        assert not retrieval.still_servable(db, db.get(User, "reviewer"), version.id)
        assert db.scalar(select(AuditEvent.id).where(AuditEvent.action == "publish")) is None
        assert len(list(db.scalars(select(AuditEvent).where(AuditEvent.action == "withdraw")))) == 1
        for job in db.scalars(select(IngestionJob)):
            assert job.status == "failed" and job.error_code == "SOURCE_WITHDRAWN"


@pytest.mark.parametrize("timing", ["before_start", "embedding", "provider_error", "before_publish"])
def test_withdrawal_stops_stale_index(index_db, monkeypatch, timing):
    factory = index_db
    with factory() as worker_db:
        # These objects intentionally remain stale after the reviewer's transaction.
        version, job = worker_db.get(DocumentVersion, "version"), worker_db.get(IngestionJob, "job")
        calls = []

        def embed(texts):
            calls.append(texts)
            if timing in ("embedding", "provider_error"):
                assert withdraw(factory) == 2
                if timing == "provider_error":
                    raise RuntimeError("Provider failed after withdrawal")
            return [retrieval.to_blob([1, 0]) for _ in texts]

        monkeypatch.setattr(retrieval, "embed_texts", embed)
        if timing == "before_start":
            withdraw(factory)
        if timing == "before_publish":
            transition = documents._index_transition

            def race(db, version, revision, states, target, **values):
                if target == "Published":
                    # Last-moment race: after approval was read, before atomic UPDATE.
                    withdraw(factory)
                return transition(db, version, revision, states, target, **values)

            monkeypatch.setattr(documents, "_index_transition", race)
        documents._run_index(worker_db, job, version)
        worker_db.commit()
        assert len(calls) == (0 if timing == "before_start" else 1)
    assert_withdrawn(factory)


def test_worker_skips_invalidated_queued_job(index_db, monkeypatch):
    factory = index_db
    withdraw(factory)
    monkeypatch.setattr(documents, "get_sessionmaker", lambda: factory)

    def unexpected(*args):
        pytest.fail("Withdrawn queued job must not call the embedding provider")

    monkeypatch.setattr(retrieval, "embed_texts", unexpected)
    documents._run_job("queued")
    assert_withdrawn(factory)


def test_worker_exception_does_not_overwrite_withdrawal(index_db, monkeypatch):
    factory = index_db
    monkeypatch.setattr(documents, "get_sessionmaker", lambda: factory)

    def broken_index(db, job, version):
        assert documents._index_transition(db, version, version.revision, ("Approved",), "Indexing")
        db.commit()
        withdraw(factory)
        raise RuntimeError("Unexpected worker failure")

    monkeypatch.setattr(documents, "_run_index", broken_index)
    documents._run_job("job")
    assert_withdrawn(factory)


def test_successful_publication_then_withdrawal(index_db, monkeypatch):
    factory = index_db
    monkeypatch.setattr(retrieval, "embed_texts", lambda texts: [retrieval.to_blob([1, 0]) for _ in texts])
    with factory() as worker_db:
        documents._run_index(worker_db, worker_db.get(IngestionJob, "job"), worker_db.get(DocumentVersion, "version"))
        worker_db.commit()
    with factory() as db:
        assert db.get(DocumentVersion, "version").state == "Published"
        assert db.get(Document, "doc").current_version_id == "version"
        assert db.get(IngestionJob, "job").status == "succeeded"
        assert retrieval.still_servable(db, db.get(User, "reviewer"), "version")
        assert len(list(db.scalars(select(AuditEvent).where(AuditEvent.action == "publish")))) == 1
    withdraw(factory)
    with factory() as db:
        assert db.get(DocumentVersion, "version").state == "Withdrawn"
        assert db.get(DocumentVersion, "version").revision == 2
        assert db.get(Document, "doc").current_version_id is None
        assert not retrieval.still_servable(db, db.get(User, "reviewer"), "version")
        with pytest.raises(AppError):
            documents.retry(db, db.get(User, "reviewer"), "version")


def test_withdrawal_refreshes_pointer_after_concurrent_publication(index_db, monkeypatch):
    factory = index_db
    monkeypatch.setattr(retrieval, "embed_texts", lambda texts: [retrieval.to_blob([1, 0]) for _ in texts])
    with factory() as reviewer_db:
        reviewer = reviewer_db.get(User, "reviewer")
        stale_version = reviewer_db.get(DocumentVersion, "version")
        stale_document = reviewer_db.get(Document, "doc")
        assert stale_version.state == "Approved" and stale_document.current_version_id is None
        with factory() as worker_db:
            documents._run_index(
                worker_db, worker_db.get(IngestionJob, "job"), worker_db.get(DocumentVersion, "version")
            )
            worker_db.commit()
        documents.withdraw(reviewer_db, reviewer, "version", "Invalid source", None)
        assert stale_version.state == "Withdrawn" and stale_document.current_version_id is None
    with factory() as db:
        assert db.get(Document, "doc").current_version_id is None
        assert db.get(DocumentVersion, "version").state == "Withdrawn"


def test_publication_transaction_rolls_back_on_audit_failure(index_db, monkeypatch):
    factory = index_db
    monkeypatch.setattr(documents, "get_sessionmaker", lambda: factory)
    monkeypatch.setattr(retrieval, "embed_texts", lambda texts: [retrieval.to_blob([1, 0]) for _ in texts])

    def broken_audit(*args, **kwargs):
        raise RuntimeError("Audit storage failed")

    monkeypatch.setattr(documents.audit, "record", broken_audit)
    documents._run_job("job")
    with factory() as db:
        assert db.get(Document, "doc").current_version_id is None
        assert db.get(DocumentVersion, "version").state == "Failed"
        assert db.get(DocumentVersion, "version").published_at is None
        assert db.scalar(select(AuditEvent.id).where(AuditEvent.action == "publish")) is None
        assert db.get(IngestionJob, "job").status == "failed"


@pytest.mark.parametrize("approval_revision", [None, 0])
def test_publication_requires_matching_approval(index_db, monkeypatch, approval_revision):
    factory = index_db
    monkeypatch.setattr(retrieval, "embed_texts", lambda texts: [retrieval.to_blob([1, 0]) for _ in texts])
    with factory() as db:
        approval = db.scalar(select(Approval).where(Approval.version_id == "version"))
        if approval_revision is None:
            db.delete(approval)
        else:
            approval.reviewed_revision = approval_revision
        db.commit()
        documents._run_index(db, db.get(IngestionJob, "job"), db.get(DocumentVersion, "version"))
        db.commit()
        assert db.get(DocumentVersion, "version").state == "Failed"
        assert db.get(IngestionJob, "job").error_code == "APPROVAL_REVISION_MISMATCH"
        assert db.get(Document, "doc").current_version_id is None
        assert db.scalar(select(AuditEvent.id).where(AuditEvent.action == "publish")) is None


def test_resume_indexing_reuses_embeddings(index_db, monkeypatch):
    factory = index_db
    with factory() as db:
        db.get(DocumentVersion, "version").state = "Indexing"
        db.get(Chunk, "chunk").embedding = retrieval.to_blob([1, 0])
        db.commit()

    def unexpected(*args):
        pytest.fail("Resume must reuse already stored embeddings")

    monkeypatch.setattr(retrieval, "embed_texts", unexpected)
    monkeypatch.setattr(documents, "get_sessionmaker", lambda: factory)
    documents._run_job("job")
    with factory() as db:
        assert db.get(DocumentVersion, "version").state == "Published"
        assert db.get(Document, "doc").current_version_id == "version"
        assert db.get(IngestionJob, "job").status == "succeeded"


def test_revision_change_invalidates_inflight_index(index_db, monkeypatch):
    factory = index_db

    def changed_revision(texts):
        with factory() as other:
            other.get(DocumentVersion, "version").revision += 1
            other.commit()
        return [retrieval.to_blob([1, 0]) for _ in texts]

    monkeypatch.setattr(retrieval, "embed_texts", changed_revision)
    with factory() as db:
        documents._run_index(db, db.get(IngestionJob, "job"), db.get(DocumentVersion, "version"))
        db.commit()
        assert db.get(DocumentVersion, "version").revision == 2
        assert db.get(DocumentVersion, "version").state == "Indexing"
        assert db.get(Document, "doc").current_version_id is None
        assert db.get(IngestionJob, "job").error_code == "INDEX_SUPERSEDED"
        assert db.scalar(select(AuditEvent.id).where(AuditEvent.action == "publish")) is None


def test_index_failure_remains_retryable(index_db, monkeypatch):
    factory = index_db

    def unavailable(texts):
        raise RuntimeError("Provider unavailable")

    monkeypatch.setattr(retrieval, "embed_texts", unavailable)
    with factory() as db:
        documents._run_index(db, db.get(IngestionJob, "job"), db.get(DocumentVersion, "version"))
        db.commit()
        assert db.get(DocumentVersion, "version").state == "Failed"
        assert db.get(IngestionJob, "job").error_code == "EMBEDDING_UNAVAILABLE"
        assert db.get(Document, "doc").current_version_id is None
        monkeypatch.setattr(documents, "start_job", lambda _: None)
        retry = documents.retry(db, db.get(User, "reviewer"), "version")
        monkeypatch.setattr(retrieval, "embed_texts", lambda texts: [retrieval.to_blob([1, 0]) for _ in texts])
        documents._run_index(db, retry, db.get(DocumentVersion, "version"))
        db.commit()
        assert db.get(DocumentVersion, "version").state == "Published"
        assert retry.status == "succeeded"
