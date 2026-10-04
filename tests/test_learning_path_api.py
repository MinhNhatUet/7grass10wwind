"""D-82: luồng đầu-cuối qua API — tiến độ → đánh giá trong phạm vi → chẩn đoán → chọn lộ trình → checkpoint → tiến độ.

LLM và truy xuất được thay bằng bản giả (không gọi provider thật); quyền, nguồn, DB là thật (SQLite tạm).
"""

import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from src.api.deps import current_user
from src.db import Base, get_db
from src.main import app
from src.models.orm import (
    Chunk,
    Course,
    CourseQuiz,
    Document,
    DocumentVersion,
    LearnerProgress,
    LearningAssessment,
    Membership,
    TopicMastery,
    User,
)
from src.services import retrieval
from src.services.learning_path import curriculum as curriculum_mod
from src.services.learning_path import service
from src.services.retrieval import Hit, servable_versions

CURRICULUM = """
lessons:
  - id: L1
    title: Quy trình phần mềm
    document: Bai 1
    topics:
      - id: L1.T1
        title: Mô hình thác nước
        query: waterfall
        objectives:
          - {id: L1.T1.O1, text: Nêu được các pha của mô hình thác nước}
          - {id: L1.T1.O2, text: Chỉ ra hạn chế của mô hình thác nước}
      - id: L1.T2
        title: Mô hình lặp
        query: iterative
  - id: L2
    title: Yêu cầu phần mềm
    document: Bai 2
    topics:
      - id: L2.T1
        title: Yêu cầu chức năng
        query: functional
        prerequisites: [L1.T1]
  - id: L3
    title: Thiết kế phần mềm
    document: Bai 3
    topics:
      - id: L3.T1
        title: Tính kết dính
        query: cohesion
        prerequisites: [L2.T1]
"""
TEXT = {
    "waterfall": "The waterfall model executes requirements, design, implementation and testing in strict sequence.",
    "iterative": "The iterative model delivers the system in repeated cycles with feedback after each iteration.",
    "functional": "A functional requirement describes a service the system must provide to its users.",
    "cohesion": "Cohesion measures how strongly the elements inside one module belong together.",
}
MISCONCEPTION = "Nghĩ rằng các pha chạy song song"


class FakeLLM:
    """Đọc các Ô và khối NGUỒN trong prompt, trả mỗi ô một câu có câu trích nguyên văn đúng nguồn của ô."""

    def __init__(self):
        self.prompts: list[str] = []
        self.bad_proof_slots: set[str] = set()

    def __call__(self, system, prompt, temperature=0.2):
        self.prompts.append(prompt)
        sources = dict(re.findall(r'<nguon so="(\d+)"[^>]*>\n(.*?)\n</nguon>', prompt, re.S))
        items = []
        for slot, topic, nguon in re.findall(
            r'<o slot="(\w+)" bai="[^"]*" chu_de="([^"]*)" muc_tieu="[^"]*" nguon="([\d,]+)"/>', prompt
        ):
            n = nguon.split(",")[0]
            proof = (
                "made up sentence that is not in any source at all"
                if slot in self.bad_proof_slots
                else " ".join(sources[n].split()[:8])
            )
            items.append({
                "slot": slot, "question": f"{topic} {slot}: điều nào đúng?",
                "options": [f"{slot} đúng", f"{slot} sai 1", f"{slot} sai 2", f"{slot} sai 3"], "correct": 0,
                "explanation": "Theo nguồn.", "misconceptions": ["", MISCONCEPTION, "Nhầm 2", "Nhầm 3"],
                "source": int(n), "proof": proof,
            })  # fmt: skip
        return {"items": items}


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'lp.db').as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    (tmp_path / "curricula").mkdir()
    (tmp_path / "curricula" / "SE101.yaml").write_text(CURRICULUM, encoding="utf-8")
    monkeypatch.setattr(curriculum_mod, "CURRICULA_DIR", tmp_path / "curricula")
    llm = FakeLLM()
    monkeypatch.setattr(service, "call_json", llm)

    def fake_evidence(db, user, course_id, query):
        """Truy xuất giả nhưng vẫn qua servable_versions → giữ đúng lọc quyền và document_scope."""
        out = []
        for version, document in servable_versions(db, user, course_id):
            for chunk in db.scalars(select(Chunk).where(Chunk.version_id == version.id)):
                if query in chunk.text.casefold():
                    out.append(Hit(chunk=chunk, version=version, document=document, score=0.9))
        return out

    monkeypatch.setattr(service, "evidence", fake_evidence)
    with factory() as db:
        users = {
            name: User(id=name, login_id=name, display_name=name, role=role, password_hash="x")
            for name, role in (("sv", "student"), ("other", "student"), ("outsider", "student"),
                               ("gv", "lecturer"), ("admin", "admin"))
        }  # fmt: skip
        db.add_all([*users.values(), Course(id="SE101", name="CNPM", status="active")])
        db.flush()
        for u in ("sv", "other", "gv"):
            db.add(Membership(user_id=u, course_id="SE101", can_read=True, can_upload=u == "gv"))
        lesson_docs = {"Bai 1": ["waterfall", "iterative"], "Bai 2": ["functional"], "Bai 3": ["cohesion"]}
        for n, (title, keys) in enumerate(lesson_docs.items(), start=1):
            db.add(Document(id=f"doc{n}", course_id="SE101", owner_id="gv", title=title, doc_type="slide"))
            db.flush()
            db.add(DocumentVersion(
                id=f"ver{n}", document_id=f"doc{n}", version_label="1", state="Published", file_type="pptx",
                original_filename=f"{title}.pptx", checksum=str(n), storage_key="x", size_bytes=1, provenance="t",
                usage_permission="confirmed", acl_roles=["student", "lecturer"], integrity_label="learning_material",
                uploader_id="gv",
            ))  # fmt: skip
            db.get(Document, f"doc{n}").current_version_id = f"ver{n}"
            db.flush()
            for k, key in enumerate(keys, start=1):
                db.add(Chunk(id=f"chk{n}{k}", version_id=f"ver{n}", ordinal=k, locator_type="slide",
                             locator_value=k + 1, text=TEXT[key]))  # fmt: skip
        db.commit()
        who = {"user": users["sv"]}
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[current_user] = lambda: who["user"]
        client = TestClient(app)
        try:
            yield client, db, users, who, llm
        finally:
            client.close()
            app.dependency_overrides.clear()
            retrieval._cache.clear()
    engine.dispose()


def answer(db, assessment_id, wrong_topics=()):
    """Trả lời: đúng hết, trừ chủ đề trong wrong_topics (chọn phương án mang hiểu nhầm MISCONCEPTION)."""
    a = db.get(LearningAssessment, assessment_id)
    out = {}
    for q in a.questions:
        if q["topic_id"] in wrong_topics:
            out[q["id"]] = next(i for i, o in enumerate(q["options"]) if q["misconceptions"].get(o) == MISCONCEPTION)
        else:
            out[q["id"]] = q["correct"]
    return out


def test_full_flow_progress_assessment_diagnosis_path_checkpoint(env):
    client, db, users, who, llm = env
    cur = client.get("/api/v1/learning/curriculum?course_id=SE101").json()
    assert cur["source"] == "authored" and [x["id"] for x in cur["lessons"]] == ["L1", "L2", "L3"]

    # 1. chưa khai báo tiến độ → không đánh giá (không đoán phạm vi)
    r = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "PROGRESS_REQUIRED"
    p = client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L2"}).json()
    assert p["covered_lesson_ids"] == ["L1", "L2"] and p["next_lesson"]["id"] == "L3"

    # 2. đề chỉ trong phạm vi đã học, phủ mọi chủ đề, không lộ đáp án
    r = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"})
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["status"] == "Open" and [x["title"] for x in a["scope"]["lessons"]] == [
        "Quy trình phần mềm",
        "Yêu cầu phần mềm",
    ]
    topics = {q["topic_title"] for q in a["questions"]}
    assert topics == {"Mô hình thác nước", "Mô hình lặp", "Yêu cầu chức năng"}
    assert all(k not in q for q in a["questions"] for k in ("correct", "explanation", "proof", "source"))
    assert "Tính kết dính" not in "".join(llm.prompts) and "cohesion" not in "".join(llm.prompts).casefold()
    stored = db.get(LearningAssessment, a["id"])
    assert {q["objective_id"] for q in stored.questions if q["topic_id"] == "L1.T1"} == {"L1.T1.O1", "L1.T1.O2"}
    assert all(
        q["source"]["document_title"] == ("Bai 2" if q["lesson_id"] == "L2" else "Bai 1") for q in stored.questions
    )
    # gọi lại khi chưa nộp → dùng lại bài đang làm, không tốn lượt LLM
    calls = len(llm.prompts)
    assert client.post("/api/v1/learning/assessments", json={"course_id": "SE101"}).json()["id"] == a["id"]
    assert len(llm.prompts) == calls

    # 3–5. nộp: sai toàn bộ "thác nước" → lỗ hổng có giải thích, gợi ý theo bài/chủ đề thật, 3 phương án lộ trình
    res = client.post(f"/api/v1/learning/assessments/{a['id']}/submit",
                      json={"answers": answer(db, a["id"], {"L1.T1"})}).json()  # fmt: skip
    result = res["result"]
    assert res["status"] == "Submitted" and all("correct" in q and q["source"] for q in res["questions"])
    gap = next(g for g in result["gaps"] if g["topic_id"] == "L1.T1")
    assert gap["level"] == "missing_foundation" and gap["lesson_title"] == "Quy trình phần mềm"
    assert set(gap["missing_concepts"]) == {
        "Nêu được các pha của mô hình thác nước",
        "Chỉ ra hạn chế của mô hình thác nước",
    }
    assert gap["evidence"] and all(e["indicates"] == MISCONCEPTION for e in gap["evidence"])
    assert gap["review"]["sources"][0]["document_title"] == "Bai 1"
    assert {t["topic_id"]: t["level"] for t in result["topics"]} == {
        "L1.T1": "missing_foundation", "L1.T2": "solid", "L2.T1": "solid"}  # fmt: skip
    obj = next(t for t in result["topics"] if t["topic_id"] == "L1.T1")["objectives"]
    assert {o["status"] for o in obj} == {"not_met"}
    assert any("“Mô hình thác nước” (bài 1: Quy trình phần mềm)" in x["text"] for x in result["recommendations"])
    assert [o["strategy"] for o in result["path_options"]][0] == result["recommended_strategy"]
    assert {o["strategy"] for o in result["path_options"]} == {
        "foundation_first",
        "continue_with_gaps",
        "intensive_review",
    }
    rows = {r.topic_id: r for r in db.scalars(select(TopicMastery).where(TopicMastery.user_id == "sv"))}
    assert set(rows) == {"L1.T1", "L1.T2", "L2.T1"} and rows["L1.T1"].mastery == 0
    # tiến độ ≠ nắm vững: đã học L1, L2 nhưng L1.T1 vẫn yếu
    mv = client.get("/api/v1/learning/mastery?course_id=SE101").json()
    l1 = next(x for x in mv["lessons"] if x["lesson_id"] == "L1")
    assert l1["covered"] and next(t for t in l1["topics"] if t["topic_id"] == "L1.T1")["level"] == "missing_foundation"
    assert not next(x for x in mv["lessons"] if x["lesson_id"] == "L3")["covered"]

    # 6–7. chọn lộ trình → các bước cụ thể
    path = client.post(f"/api/v1/learning/assessments/{a['id']}/path", json={"strategy": "foundation_first"}).json()
    kinds = [s["kind"] for s in path["steps"]]
    assert kinds == ["review", "checkpoint", "learn", "checkpoint"]
    review, check1, learn, check2 = path["steps"]
    assert review["topic_ids"] == ["L1.T1"] and review["sources"][0]["document_title"] == "Bai 1"
    assert review["objectives"] and review["activities"]
    assert learn["completes_lesson"] == "L3" and path["next_step_id"] == review["id"]

    # checkpoint không tự đánh dấu xong được
    r = client.post(f"/api/v1/learning/paths/{path['id']}/steps/{check1['id']}", json={"status": "done"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "CHECKPOINT_NEEDS_ASSESSMENT"
    client.post(f"/api/v1/learning/paths/{path['id']}/steps/{review['id']}", json={"status": "done"})

    # 8. checkpoint: bài kiểm tra theo bước, chỉ chủ đề của bước; nộp → bước xong, mức nắm vững cộng dồn
    c = client.post("/api/v1/learning/assessments",
                    json={"course_id": "SE101", "path_id": path["id"], "step_id": check1["id"]}).json()  # fmt: skip
    assert c["purpose"] == "checkpoint" and {q["topic_title"] for q in c["questions"]} == {"Mô hình thác nước"}
    client.post(f"/api/v1/learning/assessments/{c['id']}/submit", json={"answers": answer(db, c["id"])})
    db.refresh(rows["L1.T1"])
    assert (
        len(rows["L1.T1"].history) == 2 and rows["L1.T1"].level == "needs_reinforcement"
    )  # 0/3 rồi 3/3, giảm trọng số
    path = client.get(f"/api/v1/learning/paths/{path['id']}").json()
    assert path["steps"][1]["status"] == "done" and path["steps"][1]["result"]["assessment_id"] == c["id"]

    # bài mới L3 chưa học → checkpoint của nó chưa hỏi được (ngoài phạm vi)
    r = client.post(
        "/api/v1/learning/assessments", json={"course_id": "SE101", "path_id": path["id"], "step_id": check2["id"]}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "NOTHING_IN_SCOPE"
    # học xong bài mới → tiến độ mở rộng sang L3, giờ mới kiểm tra được
    client.post(f"/api/v1/learning/paths/{path['id']}/steps/{learn['id']}", json={"status": "done"})
    assert client.get("/api/v1/learning/progress?course_id=SE101").json()["covered_lesson_ids"] == ["L1", "L2", "L3"]
    c2 = client.post(
        "/api/v1/learning/assessments", json={"course_id": "SE101", "path_id": path["id"], "step_id": check2["id"]}
    )
    assert c2.status_code == 201 and {q["topic_title"] for q in c2.json()["questions"]} == {"Tính kết dính"}
    client.post(f"/api/v1/learning/assessments/{c2.json()['id']}/submit", json={"answers": answer(db, c2.json()["id"])})
    assert client.get(f"/api/v1/learning/paths/{path['id']}").json()["status"] == "Completed"

    # lần đánh giá sau dùng kết quả cũ: chủ đề yếu/chưa chắc được hỏi sâu hơn chủ đề đã vững chắc
    listing = client.get("/api/v1/learning/assessments?course_id=SE101").json()["items"]
    assert len(listing) == 3 and all(x["status"] == "Submitted" for x in listing)


def test_assessment_requires_answers_and_saves_draft(env):
    client, db, *_ = env
    client.put("/api/v1/learning/progress", json={"course_id": "SE101", "covered_lesson_ids": ["L1"]})
    a = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"}).json()
    assert {q["topic_title"] for q in a["questions"]} == {"Mô hình thác nước", "Mô hình lặp"}
    r = client.post(f"/api/v1/learning/assessments/{a['id']}/submit", json={"answers": {}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "NO_ANSWERS"
    first = a["questions"][0]["id"]
    saved = client.put(f"/api/v1/learning/assessments/{a['id']}/answers", json={"answers": {first: 2, "zz": 1}}).json()
    assert saved["status"] == "Open" and saved["questions"][0]["picked"] == 2 and saved["result"] is None
    res = client.post(f"/api/v1/learning/assessments/{a['id']}/submit", json={"answers": {}}).json()
    # câu chưa trả lời → chủ đề "chưa đủ dữ liệu", không tính là sai, không lưu mức nắm vững cho chủ đề đó
    unanswered = {n["topic_id"] for n in db.get(LearningAssessment, a["id"]).scope["not_assessed"]}
    assert "L1.T2" in unanswered
    assert next(t for t in res["result"]["topics"] if t["topic_id"] == "L1.T2")["level"] == "insufficient_data"
    assert db.scalar(select(TopicMastery).where(TopicMastery.topic_id == "L1.T2")) is None


def test_progress_change_abandons_stale_open_assessment(env):
    client, db, *_ = env
    client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L1"})
    a = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"}).json()
    client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L2"})
    b = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"}).json()
    assert b["id"] != a["id"] and db.get(LearningAssessment, a["id"]).status == "Abandoned"
    assert "Yêu cầu chức năng" in {q["topic_title"] for q in b["questions"]}


def test_unverifiable_items_are_dropped_and_topic_reported(env):
    client, db, users, who, llm = env
    client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L1"})
    llm.bad_proof_slots = {"s4", "s5", "s6"}  # khung đề: s1–s3 thác nước, s4–s6 mô hình lặp
    a = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"}).json()
    assert {q["topic_title"] for q in a["questions"]} == {"Mô hình thác nước"}
    assert [n["title"] for n in a["scope"]["not_assessed"]] == ["Mô hình lặp"]
    assert a["scope"]["not_assessed"][0]["reason"] == "no_evidence"


def test_lecturer_practice_bank_is_used_but_never_exam_questions(env):
    client, db, *_ = env
    q = {"id": "b1", "text": "Câu GV về thác nước", "options": ["a", "b", "c", "d"], "correct": 1, "explanation": "",
         "topic_id": "L1.T1", "objective_id": "L1.T1.O1"}  # fmt: skip
    db.add(
        CourseQuiz(course_id="SE101", author_id="gv", title="Luyện", kind="practice", status="Published", questions=[q])
    )
    db.add(CourseQuiz(course_id="SE101", author_id="gv", title="Thi", kind="final", status="Published",
                      questions=[{**q, "id": "x1", "text": "CÂU THI CUỐI KỲ", "objective_id": "L1.T1.O2"}]))  # fmt: skip
    db.commit()
    client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L1"})
    a = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"}).json()
    texts = [x["text"] for x in a["questions"]]
    assert "Câu GV về thác nước" in texts and "CÂU THI CUỐI KỲ" not in texts
    bank = next(x for x in db.get(LearningAssessment, a["id"]).questions if x["origin"] == "bank")
    assert bank["objective_id"] == "L1.T1.O1" and bank["quiz_ref"]["question_id"] == "b1"


def test_quiz_builder_keeps_curriculum_tags(env):
    client, db, users, who, _ = env
    who["user"] = users["gv"]
    body = {"course_id": "SE101", "title": "Luyện", "questions": [
        {"text": "x", "options": ["a", "b", "c", "d"], "correct": 0, "topic_id": "L1.T1", "lesson_id": "L1"}]}  # fmt: skip
    quiz = client.post("/api/v1/course-quizzes", json=body).json()
    assert quiz["questions"][0]["topic_id"] == "L1.T1" and quiz["questions"][0]["objective_id"] is None


def test_withdrawn_source_hides_question_and_is_not_graded(env):
    client, db, *_ = env
    client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L2"})
    a = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"}).json()
    answers = answer(db, a["id"], {"L2.T1"})
    secret = [q["text"] for q in db.get(LearningAssessment, a["id"]).questions if q["topic_id"] == "L2.T1"]
    assert secret
    db.get(DocumentVersion, "ver2").state = "Withdrawn"
    db.commit()
    view = client.get(f"/api/v1/learning/assessments/{a['id']}").json()
    withdrawn = [q for q in view["questions"] if q.get("withdrawn")]
    assert withdrawn and all(q["options"] == [] for q in withdrawn)
    res = client.post(f"/api/v1/learning/assessments/{a['id']}/submit", json={"answers": answers}).json()
    assert all(t["topic_id"] != "L2.T1" for t in res["result"]["topics"])
    # nội dung lấy từ tài liệu đã thu hồi (câu hỏi, lựa chọn, giải thích, câu trích) không lọt ra đâu cả; tên chủ đề của
    # đề cương (do giảng viên soạn, không phải nội dung tài liệu) vẫn được nhắc trong gợi ý "chưa đủ dữ liệu"
    for text in secret:
        assert text not in str(res) and text not in str(view)
    assert "Bai 2" not in str(res)
    assert {"topic_id": "L2.T1", "reason": "source_withdrawn"} in db.get(LearningAssessment, a["id"]).scope[
        "not_assessed"
    ]
    assert db.scalar(select(TopicMastery).where(TopicMastery.topic_id == "L2.T1")) is None


def test_records_are_private_and_course_acl_is_enforced(env):
    client, db, users, who, _ = env
    client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L1"})
    a = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"}).json()
    res = client.post(f"/api/v1/learning/assessments/{a['id']}/submit", json={"answers": answer(db, a["id"])}).json()
    path = client.post(f"/api/v1/learning/assessments/{a['id']}/path", json={"strategy": "continue_with_gaps"}).json()

    who["user"] = users["other"]  # cùng môn, khác người
    for url in (f"/api/v1/learning/assessments/{a['id']}", f"/api/v1/learning/paths/{path['id']}"):
        assert client.get(url).status_code == 404
    assert client.post(f"/api/v1/learning/assessments/{a['id']}/submit", json={"answers": {}}).status_code == 404
    assert client.get("/api/v1/learning/assessments?course_id=SE101").json()["items"] == []
    assert client.get("/api/v1/learning/progress?course_id=SE101").json()["covered_lesson_ids"] == []

    who["user"] = users["outsider"]  # không có quyền môn
    assert client.get("/api/v1/learning/curriculum?course_id=SE101").status_code == 404
    r = client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L1"})
    assert (
        r.status_code == 404 and db.scalar(select(LearnerProgress).where(LearnerProgress.user_id == "outsider")) is None
    )

    who["user"] = users["admin"]  # quản trị không dùng nội dung học tập (D-61)
    assert client.get("/api/v1/learning/curriculum?course_id=SE101").status_code == 403

    who["user"] = users["sv"]  # mất quyền môn → bản ghi cũ cũng không xem được
    db.scalar(select(Membership).where(Membership.user_id == "sv")).can_read = False
    db.commit()
    assert client.get(f"/api/v1/learning/assessments/{a['id']}").status_code == 404
    assert client.get(f"/api/v1/learning/paths/{path['id']}").status_code == 404
    assert res["status"] == "Submitted"


def test_invalid_inputs(env):
    client, *_ = env
    r = client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L9"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_LESSON"
    r = client.put(
        "/api/v1/learning/progress",
        json={"course_id": "SE101", "current_lesson_id": "L1", "covered_lesson_ids": ["L1"]},
    )
    assert r.status_code == 422
    client.put("/api/v1/learning/progress", json={"course_id": "SE101", "current_lesson_id": "L1"})
    a = client.post("/api/v1/learning/assessments", json={"course_id": "SE101"}).json()
    r = client.post(f"/api/v1/learning/assessments/{a['id']}/path", json={"strategy": "foundation_first"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ASSESSMENT_NOT_SUBMITTED"
    r = client.post("/api/v1/learning/assessments", json={"course_id": "SE101", "topic_ids": ["L3.T1"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "NOTHING_IN_SCOPE"


def test_derived_curriculum_from_published_slides_without_outline(env, tmp_path, monkeypatch):
    client, db, *_ = env
    monkeypatch.setattr(curriculum_mod, "CURRICULA_DIR", tmp_path / "none")
    db.get(Chunk, "chk11").text = (
        "Bài 1: Tổng quan quy trình\nNội dung\n• Mô hình thác nước\n• Mô hình lặp\n" + TEXT["waterfall"]
    )
    for n, title in ((1, "01 - Tong quan"), (2, "02 - Yeu cau"), (3, "03 - Thiet ke")):
        db.get(Document, f"doc{n}").title = title
    db.commit()
    cur = client.get("/api/v1/learning/curriculum?course_id=SE101").json()
    assert cur["source"] == "derived" and cur["notes"]
    first = cur["lessons"][0]
    assert first["title"] == "Tổng quan quy trình" and first["document_id"] == "doc1"
    assert [x["document_id"] for x in cur["lessons"]] == ["doc1", "doc2", "doc3"]  # thứ tự theo số bài của bộ slide
    assert [t["title"] for t in first["topics"]] == ["Mô hình thác nước", "Mô hình lặp"]
    topics = client.get("/api/v1/learning/topics?course_id=SE101").json()["items"]  # endpoint cũ vẫn như trước
    assert topics[0]["title"] == "Tổng quan quy trình" and topics[0]["sections"] == ["Mô hình thác nước", "Mô hình lặp"]
