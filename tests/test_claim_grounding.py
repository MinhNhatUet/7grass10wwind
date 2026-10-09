"""Offline claim-grounding regressions; synthetic sources, no real AI calls.

These test gate mechanics and mocked entailment verdicts, NOT judge accuracy.
"""

import copy
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from src.api.deps import current_user
from src.db import Base, get_db
from src.main import app
from src.models.orm import Chunk, Citation, Conversation, Course, Document, DocumentVersion, Membership, Message, User
from src.services import conversations, llm
from src.services.assistants import LlmError, academic, grounding, track_usage, validate_citations
from src.services.retrieval import Hit

QUOTE1 = "A connected undirected graph with n vertices has at least n-1 edges."
QUOTE2 = "A tree is a connected undirected graph without any cycles."
CLAIM1 = "Đồ thị vô hướng liên thông có n đỉnh có ít nhất n-1 cạnh."
CLAIM2 = "Cây là đồ thị vô hướng liên thông không có chu trình."


@pytest.fixture
def context(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'grounding.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as db:
        student = User(id="student", login_id="student", display_name="Student", role="student", password_hash="unused")
        db.add_all([student, Course(id="course", name="Course", status="active")])
        db.flush()
        db.add(Membership(user_id=student.id, course_id="course", can_read=True))
        conv = Conversation(id="conv", owner_id=student.id, course_id="course", title="Hội thoại mới")
        db.add(conv)
        hits = []
        for n, text in enumerate((QUOTE1, QUOTE2), 1):
            doc = Document(
                id=f"doc{n}", course_id="course", owner_id=student.id, title=f"Book {n}", doc_type="textbook"
            )
            db.add(doc)
            db.flush()
            version = DocumentVersion(
                id=f"ver{n}",
                document_id=doc.id,
                version_label="1",
                state="Published",
                file_type="pdf",
                original_filename="book.pdf",
                checksum=str(n),
                storage_key="unused",
                size_bytes=100,
                page_count=1,
                provenance="synthetic",
                usage_permission="confirmed",
                acl_roles=["student"],
                download_allowed=False,
                integrity_label="learning_material",
                uploader_id=student.id,
            )
            db.add(version)
            doc.current_version_id = version.id
            db.flush()
            chunk = Chunk(
                id=f"chunk{n}", version_id=version.id, ordinal=1, locator_type="page", locator_value=n, text=text
            )
            db.add(chunk)
            db.flush()
            hits.append(Hit(chunk, version, doc, 1))
        db.commit()
        monkeypatch.setattr(academic, "evidence", lambda *args: hits)

        def forbidden(*args, **kwargs):
            pytest.fail("Tests must not access any real AI provider")

        monkeypatch.setattr(llm, "get_llm", forbidden)
        yield db, student, conv, hits, factory
    engine.dispose()


def claim(text=CLAIM1, refs=None, quotes=None):
    return {
        "claim": text,
        "source_refs": [1] if refs is None else refs,
        "supporting_quote": {"1": QUOTE1} if quotes is None else quotes,
    }


def draft(monkeypatch, claims, status="answered", **extras):
    data = {"status": status, "claims": claims, **extras}
    monkeypatch.setattr(academic, "call_json", lambda *args, **kwargs: copy.deepcopy(data))


def judge(monkeypatch, verdict="supported", side_effect=None):
    requests = []

    def review(system, user, **kwargs):
        rows = json.loads(user)["claims"]
        requests.extend(rows)
        assert "DỮ LIỆU KHÔNG TIN CẬY" in system
        if side_effect:
            side_effect()
        return {"verdicts": [{"id": row["id"], "verdict": verdict} for row in rows]}

    monkeypatch.setattr(grounding, "call_json", review)
    return requests


def answer(context):
    db, student, *_ = context
    return academic.answer(db, student, "course", "Explain graphs", [])


def test_existing_validator_removes_whole_invalid_or_revoked_sentences(context):
    db, student, _, hits, _ = context
    hits[1].version.state = "Withdrawn"
    db.commit()
    text, used, dropped = validate_citations(
        db, student, "Ý hợp lệ [1]. Ý từ nguồn đã thu hồi [2]. Ý có nguồn giả [99].", hits
    )
    assert text == "Ý hợp lệ [1]." and [n for n, _ in used] == [1] and dropped


def test_mixed_claims_reject_entire_invalid_claim_not_just_its_marker(context, monkeypatch):
    db, _, _, _, _ = context
    rows = [claim(), claim("SECRET_REVOKED", [2], {"2": QUOTE2}), claim("SECRET_FAKE", [99], {"99": QUOTE1})]

    def generate(*args, **kwargs):
        db.get(DocumentVersion, "ver2").state = "Withdrawn"
        db.commit()
        return {"status": "answered", "claims": rows}

    monkeypatch.setattr(academic, "call_json", generate)
    requests = judge(monkeypatch)
    result = answer(context)
    assert result.status == "partial" and CLAIM1 in result.content
    assert "SECRET" not in result.content and "SECRET" not in json.dumps(result.payload)
    assert len(requests) == 1 and requests[0]["id"] == 0
    assert result.payload["grounding"] == {"proposed": 3, "accepted": 1, "removed": 2}
    assert [n for n, _ in result.used] == [1]


@pytest.mark.parametrize(
    "damage",
    [
        "no_refs",
        "fake",
        "boolean",
        "string",
        "duplicate",
        "no_quote",
        "fabricated",
        "translated",
        "oversize",
        "marker",
        "empty",
        "extra_quote",
    ],
)
def test_bad_claim_evidence_never_reaches_judge(context, monkeypatch, damage):
    row = claim()
    if damage == "no_refs":
        row["source_refs"] = []
    elif damage == "fake":
        row["source_refs"] = [99]
    elif damage == "boolean":
        row["source_refs"] = [True]
    elif damage == "string":
        row["source_refs"] = ["1"]
    elif damage == "duplicate":
        row["source_refs"] = [1, 1]
    elif damage == "no_quote":
        row["supporting_quote"] = {}
    elif damage == "fabricated":
        row["supporting_quote"] = {"1": "Graphs always have exactly 100 edges."}
    elif damage == "translated":
        row["supporting_quote"] = {"1": CLAIM1}
    elif damage == "oversize":
        row["supporting_quote"] = {"1": QUOTE1 * 20}
    elif damage == "marker":
        row["claim"] += " [99]"
    elif damage == "empty":
        row["claim"] = ""
    else:
        row["supporting_quote"]["2"] = QUOTE2
    draft(monkeypatch, [row])
    requests = judge(monkeypatch)
    result = answer(context)
    assert result.status == "insufficient_evidence" and not result.used and not requests
    assert CLAIM1 not in result.content


@pytest.mark.parametrize("verdict", ["unsupported", "contradicted", "uncertain"])
def test_real_quote_does_not_prove_wrong_claim(context, monkeypatch, verdict):
    wrong = "Mọi đồ thị vô hướng liên thông luôn có đúng 100 cạnh."
    draft(monkeypatch, [claim(wrong)])
    requests = judge(monkeypatch, verdict)
    result = answer(context)
    assert requests[0]["evidence"][0]["supporting_quote"] == QUOTE1
    assert result.status == "insufficient_evidence" and wrong not in result.content
    assert not result.used and not result.quotes


def test_good_paraphrase_has_complete_per_occurrence_evidence(context, monkeypatch):
    db, _, conv, *_ = context
    draft(monkeypatch, [claim(), claim("Suy luận: một đồ thị liên thông với 4 đỉnh cần ít nhất 3 cạnh.")])
    judge(monkeypatch)
    result = answer(context)
    assert result.status == "answered" and result.content.count("[1]") == 2
    proof = result.payload["evidence"]["1"]
    assert len(proof) == 2 and all(p["quote"] == QUOTE1 for p in proof)
    # Persistence must preserve verified proof, not replace it with a lexical excerpt.
    monkeypatch.setattr(conversations, "occurrence_evidence", lambda *args: pytest.fail("Do not replace checked proof"))
    msg = conversations._persist_answer(db, conv, "request", "academic", result)
    db.commit()
    assert msg.payload["evidence"]["1"] == proof
    citation = db.scalar(select(Citation).where(Citation.message_id == msg.id))
    assert citation.quote == QUOTE1


def test_distinct_quotes_for_same_source_are_preserved(context, monkeypatch):
    db, _, conv, hits, _ = context
    hits[0].chunk.text += "\n" + QUOTE2
    db.commit()
    draft(monkeypatch, [claim(), claim(CLAIM2, [1], {"1": QUOTE2})])
    judge(monkeypatch)
    result = answer(context)
    msg = conversations._persist_answer(db, conv, "request", "academic", result)
    assert [p["quote"] for p in msg.payload["evidence"]["1"]] == [QUOTE1, QUOTE2]


def test_multi_source_claim_requires_each_source_to_be_valid(context, monkeypatch):
    draft(monkeypatch, [claim(CLAIM1 + " " + CLAIM2, [1, 2], {"1": QUOTE1, "2": QUOTE2})])
    judge(monkeypatch)
    result = answer(context)
    assert [n for n, _ in result.used] == [1, 2] and "[1][2]" in result.content
    assert set(result.payload["evidence"]) == {"1", "2"}


@pytest.mark.parametrize("kind", ["withdraw", "membership", "account", "course"])
def test_permissions_rechecked_after_reviewer_using_another_session(context, monkeypatch, kind):
    *_, factory = context
    draft(monkeypatch, [claim()])

    def revoke():
        with factory() as other:
            if kind == "withdraw":
                other.get(DocumentVersion, "ver1").state = "Withdrawn"
            elif kind == "membership":
                other.scalar(select(Membership)).can_read = False
            elif kind == "course":
                other.get(Course, "course").status = "withdrawn"
            else:
                other.get(User, "student").status = "locked"
            other.commit()

    judge(monkeypatch, side_effect=revoke)
    result = answer(context)
    assert result.status == "insufficient_evidence" and CLAIM1 not in result.content and not result.used


@pytest.mark.parametrize(
    "verdicts",
    [
        None,
        [],
        [{"id": 0, "verdict": "yes"}],
        [{"id": 99, "verdict": "supported"}],
        [{"id": True, "verdict": "supported"}],
        [{"id": 0, "verdict": "supported"}, {"id": 0, "verdict": "supported"}],
    ],
)
def test_malformed_verifier_fails_closed(context, monkeypatch, verdicts):
    draft(monkeypatch, [claim()])
    monkeypatch.setattr(grounding, "call_json", lambda *args, **kwargs: {"verdicts": verdicts})
    with pytest.raises(LlmError, match="INVALID_GROUNDING_VERDICT"):
        answer(context)


@pytest.mark.parametrize("raw", [None, "bad", {}, [claim()] * 25])
def test_bad_draft_schema_does_not_use_legacy_answer(context, monkeypatch, raw):
    draft(monkeypatch, raw, answer="SECRET_UNCHECKED [1].", quotes={"1": QUOTE1})
    with pytest.raises(LlmError, match="INVALID_CLAIMS_SCHEMA"):
        answer(context)


def test_free_text_fields_cannot_escape_the_gate(context, monkeypatch):
    draft(monkeypatch, [claim()], answer="SECRET_UNCHECKED [1].", missing=["SECRET_UNCHECKED"], quotes={"1": QUOTE2})
    judge(monkeypatch)
    result = answer(context)
    assert result.status == "partial" and "SECRET" not in result.content and "SECRET" not in json.dumps(result.payload)
    assert result.quotes[1] == QUOTE1


def test_source_unavailable_before_generation_does_not_reach_llm(context, monkeypatch):
    db, student, *_ = context
    student.status = "locked"
    db.commit()
    monkeypatch.setattr(academic, "call_json", lambda *args, **kwargs: pytest.fail("No unauthorized source in prompt"))
    assert answer(context).status == "insufficient_evidence"


def test_exact_quote_preserves_operators_not_just_word_sequences():
    source = "A value x > 100 is required for this condition."
    assert grounding.exact_quote(source, source) == source
    assert not grounding.exact_quote(source.replace(">", "<"), source)
    assert not grounding.exact_quote("…" * 25, source)
    assert not grounding.exact_quote(source.replace("x", "X"), source)
    assert grounding.exact_quote(source.replace(" ", "\n"), source)


def test_reviewer_provider_error_does_not_persist_or_return_draft(context, monkeypatch):
    db, student, conv, *_ = context
    draft(monkeypatch, [claim("SECRET_UNCHECKED")])

    def unavailable(*args, **kwargs):
        raise LlmError("PROVIDER_TIMEOUT")

    monkeypatch.setattr(grounding, "call_json", unavailable)

    def run(**kwargs):
        return answer(context), {"assistant": "academic", "course_id": "course"}

    monkeypatch.setattr(conversations.orchestrator, "run", run)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[current_user] = lambda: student
    client = TestClient(app)  # No lifespan/product database startup.
    try:
        response = client.post(
            f"/api/v1/conversations/{conv.id}/messages", json={"content": "Explain graphs", "assistant": "academic"}
        )
        assert response.status_code == 503 and response.json()["error"]["retryable"]
        assert "SECRET" not in response.text
        assert not db.scalars(select(Message).where(Message.role == "assistant")).all()
    finally:
        client.close()
        app.dependency_overrides.clear()


def test_review_can_detect_conflicts_in_uncited_authorized_sources(context, monkeypatch):
    db, _, _, hits, _ = context
    hits[1].chunk.text = "A connected graph with n vertices may have fewer than n-1 edges."
    db.commit()
    draft(monkeypatch, [claim()])

    def review(system, user, **kwargs):
        data = json.loads(user)
        assert len(data["sources"]) == 2  # Not just the one source chosen by the generator.
        assert data["sources"][1]["context"] == hits[1].chunk.text
        assert data["claims"][0]["evidence"][0]["source_ref"] == 1
        return {"verdicts": [{"id": 0, "verdict": "unsupported"}]}

    monkeypatch.setattr(grounding, "call_json", review)
    assert answer(context).status == "insufficient_evidence"


def test_generation_and_review_tokens_share_usage_tracking(context, monkeypatch):
    from langchain_core.messages import AIMessage

    db, student, *_ = context
    outputs = iter(
        [
            {"status": "answered", "claims": [claim()]},
            {"verdicts": [{"id": 0, "verdict": "supported"}]},
        ]
    )

    class FakeLlm:
        def invoke(self, messages):
            return AIMessage(
                content=json.dumps(next(outputs)),
                usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
            )

    monkeypatch.setattr(llm, "get_llm", lambda **kwargs: FakeLlm())
    with track_usage() as tokens:
        result = academic.answer(db, student, "course", "Explain graphs", [])
    assert result.status == "answered" and tokens == [20, 10]
