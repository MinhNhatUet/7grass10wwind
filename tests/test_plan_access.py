"""BL-14/23/26: server-side plan redaction and authorized calendar export."""

import copy
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import sessionmaker

from src.api import conversations as plan_api
from src.api.deps import current_user
from src.db import Base, get_db
from src.main import app
from src.models.orm import (
    Chunk,
    Citation,
    Conversation,
    Course,
    Document,
    DocumentVersion,
    Membership,
    Message,
    StudyPlan,
    User,
)
from src.services import conversations, retrieval
from src.services.assistants import AssistantResult, learning
from src.services.errors import AppError
from src.services.plan_calendar import plan_ics
from src.services.policy import SOURCE_WITHDRAWN_MESSAGE

SECRET = "RESTRICTED_PLAN_CONTENT"
CALENDAR = "/api/v1/learning/plans/plan/calendar.ics?start=2026-10-01&at=19:00"


@pytest.fixture
def plan_setup(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'plans.db').as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as db:
        student = User(id="student", login_id="student", display_name="Student", role="student", password_hash="unused")
        stranger = User(
            id="stranger", login_id="stranger", display_name="Stranger", role="student", password_hash="unused"
        )
        db.add_all([student, stranger, Course(id="course", name="Course", status="active")])
        db.flush()
        db.add(Membership(user_id="student", course_id="course", can_read=True))
        db.add(Conversation(id="conv", owner_id="student", course_id="course", title="My plan"))
        db.flush()
        msg = Message(
            id="message",
            conversation_id="conv",
            role="assistant",
            content=SECRET,
            payload={"kind": "plan", "plan_id": "plan", "route": {"reason": SECRET}},
        )
        db.add(msg)
        for n in (1, 2):
            doc = Document(id=f"doc{n}", course_id="course", owner_id="student", title=SECRET, doc_type="textbook")
            db.add(doc)
            db.flush()
            db.add(
                DocumentVersion(
                    id=f"ver{n}",
                    document_id=doc.id,
                    version_label="1",
                    state="Published",
                    revision=1,
                    file_type="pdf",
                    original_filename="test.pdf",
                    checksum=str(n),
                    storage_key="test",
                    size_bytes=100,
                    provenance="test",
                    usage_permission="confirmed",
                    acl_roles=["student"],
                    integrity_label="learning_material",
                    uploader_id="student",
                )
            )
            doc.current_version_id = f"ver{n}"
            db.flush()
            db.add(
                Chunk(
                    id=f"chunk{n}", version_id=f"ver{n}", ordinal=1, locator_type="page", locator_value=1, text=SECRET
                )
            )
            db.flush()
            db.add(
                Citation(
                    message_id="message",
                    ordinal=n,
                    chunk_id=f"chunk{n}",
                    version_id=f"ver{n}",
                    document_id=doc.id,
                    locator_type="page",
                    locator_value=1,
                    quote=SECRET,
                    source_revision=1,
                )
            )
        sessions = [
            {
                "id": f"s{n}",
                "day": 1,
                "minutes": 20,
                "status": "done" if n == 1 else "not_started",
                "title": SECRET,
                "objective": SECRET,
                "activity": SECRET,
                "self_check": SECRET,
                "sources": [n],
                "evidence": {str(n): {"quote": SECRET}},
                "proof": SECRET,
                "future_text_field": SECRET,
            }
            for n in (1, 2)
        ]
        plan = StudyPlan(
            id="plan",
            owner_id="student",
            course_id="course",
            conversation_id="conv",
            goal=SECRET,
            days=1,
            minutes_per_day=45,
            status="Confirmed",
            data={
                "message_id": "message",
                "sessions": sessions,
                "warnings": [SECRET],
                "total_minutes": 40,
                "budget_minutes": 45,
            },
        )
        db.add(plan)
        db.commit()
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[current_user] = lambda: student
        client = TestClient(app)  # No lifespan: never initialize product DB/jobs.
        try:
            yield client, db, student, stranger, plan, factory
        finally:
            client.close()
            app.dependency_overrides.clear()
            retrieval._cache.clear()
    engine.dispose()


def revoke(db, kind):
    if kind == "withdraw":
        db.get(DocumentVersion, "ver2").state = "Withdrawn"
    elif kind == "lock":
        db.get(Document, "doc2").emergency_locked = True
    elif kind == "membership":
        db.scalar(select(Membership).where(Membership.user_id == "student")).can_read = False
    elif kind == "expiry":
        db.scalar(select(Membership).where(Membership.user_id == "student")).valid_to = datetime.now(UTC) - timedelta(
            days=1
        )
    elif kind == "acl":
        db.get(DocumentVersion, "ver2").acl_roles = ["lecturer"]
    elif kind == "replace":
        db.get(Document, "doc2").current_version_id = None
    elif kind == "account":
        db.get(User, "student").status = "locked"
    elif kind == "course":
        db.get(Course, "course").status = "withdrawn"
    db.commit()


@pytest.mark.parametrize("kind", ["withdraw", "lock", "membership", "expiry", "acl", "replace", "account", "course"])
def test_redaction_applies_to_detail_list_chat_and_export(plan_setup, kind):
    client, db, student, _, plan, _ = plan_setup
    original = copy.deepcopy(plan.data)
    revoke(db, kind)
    for path in ("/api/v1/learning/plans/plan", "/api/v1/learning/plans", "/api/v1/conversations/conv/messages"):
        response = client.get(path)
        assert response.status_code == 200
        assert SECRET not in response.text
    view = conversations.plan_view(db, student, plan)
    assert view["masked"] and view["goal"] == SOURCE_WITHDRAWN_MESSAGE
    for session in view["sessions"]:
        assert session["needs_update"] and session["sources"] == []
        assert "evidence" not in session and "proof" not in session and "future_text_field" not in session
        assert session["objective"] == session["activity"] == session["self_check"] == ""
    assert [s["status"] for s in view["sessions"]] == ["done", "not_started"]
    assert plan.data == original  # Redaction is a view, not destructive editing of persisted content.
    response = client.get(CALENDAR)
    assert response.status_code == 410 and response.json()["error"]["code"] == "SOURCE_UNAVAILABLE"
    assert SECRET not in response.text and "BEGIN:VCALENDAR" not in response.text


def test_valid_plan_keeps_contents_and_calendar_scheduling(plan_setup):
    client, db, student, _, plan, _ = plan_setup
    view = conversations.plan_view(db, student, plan)
    assert not view["masked"] and view["goal"] == SECRET
    assert all(not s["needs_update"] for s in view["sessions"])
    assert client.get("/api/v1/learning/plans").json()["items"][0]["goal"] == SECRET
    assert client.get("/api/v1/conversations/conv/messages").json()["items"][0]["metadata"]["plan"] == view
    response = client.get(CALENDAR)
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    assert "text/calendar" in response.headers["content-type"]
    assert response.text.count("BEGIN:VEVENT") == 2 and SECRET in response.text
    assert "20261001T190000" in response.text and "20261001T192000" in response.text


@pytest.mark.parametrize("damage", ["no_message", "no_citations", "unknown_ref", "empty_mapping", "foreign_message"])
def test_missing_or_invalid_provenance_fails_closed(plan_setup, damage):
    client, db, _, stranger, plan, _ = plan_setup
    if damage == "no_message":
        plan.data = {**plan.data, "message_id": "missing"}
    elif damage == "no_citations":
        db.execute(delete(Citation).where(Citation.message_id == "message"))
    elif damage == "unknown_ref":
        data = copy.deepcopy(plan.data)
        data["sessions"][0]["sources"] = [99]
        plan.data = data
    elif damage == "empty_mapping":
        plan.data = {**plan.data, "source_versions": {}}
    elif damage == "foreign_message":
        db.add(Conversation(id="foreign", owner_id=stranger.id, course_id="course"))
        db.flush()
        db.get(Message, "message").conversation_id = "foreign"
    db.commit()
    response = client.get("/api/v1/learning/plans/plan")
    assert response.status_code == 200 and response.json()["masked"]
    assert SECRET not in response.text
    assert client.get(CALENDAR).status_code == 410
    # Cached citation relationships must not defeat the plan's missing provenance.
    if damage != "foreign_message":
        assert SECRET not in client.get("/api/v1/conversations/conv/messages").text


def test_persisted_provenance_survives_message_retention(plan_setup):
    client, db, _, _, plan, _ = plan_setup
    plan.data = {**plan.data, "source_versions": {"1": "ver1", "2": "ver2"}}
    db.execute(delete(Citation).where(Citation.message_id == "message"))
    db.execute(delete(Message).where(Message.id == "message"))
    db.commit()
    assert not client.get("/api/v1/learning/plans/plan").json()["masked"]
    assert client.get(CALENDAR).status_code == 200
    revoke(db, "withdraw")
    assert SECRET not in client.get("/api/v1/learning/plans/plan").text
    assert client.get(CALENDAR).status_code == 410


def test_plan_creation_saves_source_version_mapping(plan_setup):
    _, db, student, _, _, _ = plan_setup
    hit = retrieval.Hit(db.get(Chunk, "chunk1"), db.get(DocumentVersion, "ver1"), db.get(Document, "doc1"), 1)
    result = AssistantResult(
        status="answered",
        content="Plan",
        used=[(1, hit)],
        payload={
            "plan_data": {
                "previous_version": 0,
                "previous_id": None,
                "goal": "Goal",
                "days": 1,
                "minutes": 45,
                "sessions": [{"id": "s1", "day": 1, "minutes": 20, "sources": [1]}],
                "warnings": [],
                "total_minutes": 20,
                "budget_minutes": 45,
            }
        },
    )
    msg = Message(conversation_id="conv", role="assistant", content="Plan")
    db.add(msg)
    db.flush()
    conversations._attach_plan(db, student, db.get(Conversation, "conv"), msg, result, "course")
    db.commit()
    created = db.get(StudyPlan, msg.payload["plan_id"])
    assert created.data["source_versions"] == {"1": "ver1"}
    assert not conversations.plan_view(db, student, created)["masked"]


def test_calendar_supports_explicit_plan_dates(plan_setup):
    client, db, _, _, plan, _ = plan_setup
    plan.data = {**plan.data, "dates": ["2026-10-07"]}
    db.commit()
    response = client.get("/api/v1/learning/plans/plan/calendar.ics?at=19:00")
    assert response.status_code == 200 and "20261007T190000" in response.text


def test_previous_plan_is_rechecked_after_retrieval(plan_setup, monkeypatch):
    _, db, student, _, plan, factory = plan_setup
    hit = retrieval.Hit(db.get(Chunk, "chunk1"), db.get(DocumentVersion, "ver1"), db.get(Document, "doc1"), 1)

    def evidence_then_withdraw(*args):
        with factory() as other:
            revoke(other, "withdraw")
        return [hit]

    def unexpected(*args, **kwargs):
        pytest.fail("Revoked previous plan must not be placed in the LLM prompt")

    monkeypatch.setattr(learning, "evidence", evidence_then_withdraw)
    monkeypatch.setattr(learning, "call_json", unexpected)
    result, data = learning.plan(db, student, "course", "New goal", 1, 45, plan)
    assert data is None and result.status == "insufficient_evidence"
    assert SECRET not in result.content


def test_owner_is_checked_for_every_plan_surface(plan_setup):
    client, db, _, stranger, plan, _ = plan_setup
    app.dependency_overrides[current_user] = lambda: stranger
    for path in ("/api/v1/learning/plans/plan", CALENDAR, "/api/v1/conversations/conv/messages"):
        assert client.get(path).status_code == 404
    assert client.get("/api/v1/learning/plans").json()["items"] == []
    with pytest.raises(AppError):
        conversations.plan_view(db, stranger, plan)


@pytest.mark.parametrize("kind", ["account", "expiry", "withdraw"])
def test_plan_view_refreshes_permissions_from_another_session(plan_setup, kind):
    _, db, student, _, plan, factory = plan_setup
    assert not conversations.plan_view(db, student, plan)["masked"]
    with factory() as other:
        revoke(other, kind)
    view = conversations.plan_view(db, student, plan)
    assert view["masked"] and SECRET not in str(view)


def test_export_reauthorizes_after_calendar_render(plan_setup, monkeypatch):
    client, _, _, _, _, factory = plan_setup
    render = plan_api.plan_ics

    def render_then_withdraw(view, start, at):
        calendar = render(view, start, at)
        with factory() as other:
            revoke(other, "withdraw")
        return calendar

    monkeypatch.setattr(plan_api, "plan_ics", render_then_withdraw)
    response = client.get(CALENDAR)
    assert response.status_code == 410 and SECRET not in response.text


def test_calendar_renderer_rejects_raw_or_masked_plan(plan_setup):
    _, _, _, _, plan, _ = plan_setup
    for raw in (plan, {"id": "plan", "goal": SECRET}, {"masked": True, "goal": SECRET}):
        with pytest.raises(AppError):
            plan_ics(raw, None, datetime.now().time())


@pytest.mark.parametrize("operation", ["confirm", "session", "status", "edit"])
def test_mutation_responses_use_the_redacted_view(plan_setup, operation):
    client, db, _, _, plan, _ = plan_setup
    if operation == "confirm":
        plan.status = "Draft"
        db.commit()
    revoke(db, "withdraw")
    base = "/api/v1/learning/plans/plan"
    if operation == "confirm":
        response = client.post(base + "/confirm")
    elif operation == "session":
        response = client.patch(base + "/sessions/s2", json={"status": "in_progress"})
    elif operation == "status":
        response = client.post(base + "/status", json={"status": "Paused"})
    else:
        response = client.put(
            base,
            json={
                "goal": SECRET,
                "sessions": [
                    {
                        "id": "s1",
                        "day": 1,
                        "minutes": 20,
                        "title": SECRET,
                        "objective": SECRET,
                        "activity": SECRET,
                        "self_check": SECRET,
                    }
                ],
            },
        )
    assert response.status_code == 200 and response.json()["masked"]
    assert SECRET not in response.text


@pytest.mark.parametrize("option", ["plan_id", "previous_plan_id"])
def test_withdrawn_plan_cannot_be_reused_for_learning(plan_setup, monkeypatch, option):
    client, db, _, _, _, _ = plan_setup
    revoke(db, "withdraw")

    def unexpected(**kwargs):
        pytest.fail("Masked plan must not reach the LLM/agent")

    monkeypatch.setattr(conversations.orchestrator, "run", unexpected)
    response = client.post(
        "/api/v1/conversations/conv/messages",
        json={
            "content": "Adjust my plan",
            "assistant": "learning",
            "learning": {"action": "plan", option: "plan"},
        },
    )
    assert response.status_code == 410
    assert SECRET not in response.text
