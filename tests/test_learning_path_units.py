"""D-82: hàm thuần của lộ trình theo tiến độ — chương trình học, khung đề, chấm/chẩn đoán, gợi ý, lộ trình."""

import pytest

from src.services.learning_path import diagnosis, roadmap
from src.services.learning_path.blueprint import build_blueprint
from src.services.learning_path.curriculum import CurriculumError, derive, parse_authored

RAW = {
    "lessons": [
        {"id": "L1", "title": "Quy trình phần mềm", "document": "Bai 1", "topics": [
            {"id": "L1.T1", "title": "Mô hình thác nước", "objectives": [
                {"id": "L1.T1.O1", "text": "Nêu các pha của thác nước"},
                {"id": "L1.T1.O2", "text": "Chỉ ra hạn chế của thác nước"}]},
            {"id": "L1.T2", "title": "Mô hình lặp"}]},
        {"id": "L2", "title": "Yêu cầu phần mềm", "topics": [
            {"id": "L2.T1", "title": "Yêu cầu chức năng", "prerequisites": ["L1.T1"]}]},
        {"id": "L3", "title": "Thiết kế", "topics": [
            {"id": "L3.T1", "title": "Tính kết dính", "prerequisites": ["L2.T1"]}]},
    ]
}  # fmt: skip


@pytest.fixture
def cur():
    return parse_authored(RAW, "SE101", {"Bai 1": ("doc1", "Bai 1")})


def m(level, mastery=None, conf="medium"):
    return {"level": level, "mastery": mastery, "confidence": conf, "history": []}


# ---------------------------------------------------------------- chương trình học


def test_authored_curriculum_orders_lessons_and_resolves_documents(cur):
    assert [x.id for x in cur.lessons] == ["L1", "L2", "L3"] and cur.source == "authored"
    assert cur.lesson("L1").document_id == "doc1" and cur.lesson("L2").document_id is None
    assert [o.id for o in cur.topic("L1.T2").objectives] == ["L1.T2.O1"]  # mục tiêu mặc định khi đề cương bỏ trống
    assert cur.lessons_upto("L2") == ["L1", "L2"]
    assert cur.topic("L3.T1").prerequisites == ("L2.T1",)


def test_authored_document_not_readable_is_reported():
    c = parse_authored(RAW, "SE101", {})
    assert c.lesson("L1").document_id is None and c.notes


@pytest.mark.parametrize(
    "mutate, error",
    [
        (lambda r: r["lessons"][1]["topics"][0].update(prerequisites=["L3.T1"]), "tiên quyết"),
        (lambda r: r["lessons"][1]["topics"][0].update(id="L1.T1"), "trùng"),
        (lambda r: r["lessons"][0].update(topics=[]), "ít nhất"),
        (lambda r: r["lessons"][0].update(id="bad id!"), "id không hợp lệ"),
    ],
)
def test_authored_curriculum_rejects_invalid_outline(mutate, error):
    import copy

    raw = copy.deepcopy(RAW)
    mutate(raw)
    with pytest.raises(CurriculumError, match=error):
        parse_authored(raw, "SE101", {})


def test_derived_curriculum_from_slides_and_textbook_chapters():
    chapters = [
        {"chapter": "5", "title": "Graphs", "page": 40, "sections": ["Paths", "Cycles"], "document": "Book",
         "document_id": "dB"},
        {"chapter": "2", "title": "Yêu cầu", "page": 1, "sections": [], "document": "Bài giảng (slide)",
         "kind": "lesson", "document_id": "d2"},
        {"chapter": "1", "title": "Tổng quan", "page": 1, "sections": ["Thác nước", "Lặp", "Lặp"],
         "document": "Bài giảng (slide)", "kind": "lesson", "document_id": "d1"},
    ]  # fmt: skip
    c = derive("SE101", chapters)
    assert [x.title for x in c.lessons] == ["Tổng quan", "Yêu cầu", "Graphs"]  # slide (tiến độ lớp) trước, theo số bài
    assert [t.title for t in c.lessons[0].topics] == ["Thác nước", "Lặp"]  # bỏ trùng
    assert [t.title for t in c.lessons[1].topics] == ["Yêu cầu"]  # bài không có mục con → 1 chủ đề
    assert c.lessons[2].document_title == "Book" and c.lessons[2].page == 40
    assert c.source == "derived" and c.notes
    assert derive("SE101", chapters).to_dict() == c.to_dict()  # id ổn định giữa các lần dựng


# ---------------------------------------------------------------- khung đề


def test_blueprint_only_covers_learned_lessons_and_every_topic(cur):
    bp = build_blueprint(cur, {"L1", "L2"}, {}, max_questions=20)
    assert {s.topic_id for s in bp.slots} == {"L1.T1", "L1.T2", "L2.T1"}
    assert all(s.lesson_id in ("L1", "L2") for s in bp.slots)
    # chủ đề chưa từng đánh giá → hỏi sâu; chủ đề có 2 mục tiêu → phủ cả hai
    t1 = [s.objective_id for s in bp.slots if s.topic_id == "L1.T1"]
    assert {"L1.T1.O1", "L1.T1.O2"} <= set(t1) and len(t1) == 3


def test_blueprint_quota_keeps_breadth_and_reports_deferred(cur):
    bp = build_blueprint(cur, {"L1", "L2"}, {}, max_questions=3)
    assert sorted(s.topic_id for s in bp.slots) == ["L1.T1", "L1.T2", "L2.T1"]  # 1 câu/chủ đề trước khi hỏi sâu
    bp = build_blueprint(cur, {"L1", "L2"}, {"L1.T1": m("solid"), "L1.T2": m("missing_foundation")}, max_questions=2)
    assert {s.topic_id for s in bp.slots} == {"L1.T2", "L2.T1"}  # chưa đánh giá + yếu được ưu tiên
    assert bp.deferred == [{"topic_id": "L1.T1", "reason": "quota"}]


def test_blueprint_solid_confident_topics_get_one_question(cur):
    mastery = {"L1.T2": m("solid", 1.0, "high")}
    bp = build_blueprint(cur, {"L1"}, mastery, max_questions=20)
    assert sum(s.topic_id == "L1.T2" for s in bp.slots) == 1


def test_blueprint_focus_outside_scope_is_excluded(cur):
    bp = build_blueprint(cur, {"L1"}, {}, 20, focus_topic_ids=["L1.T2", "L3.T1"])
    assert {s.topic_id for s in bp.slots} == {"L1.T2"} and bp.excluded == ["L3.T1"]


# ---------------------------------------------------------------- chấm, mức nắm vững, lỗ hổng


def q(qid, topic, obj, correct=0, lesson="L1", mis=None):
    opts = [f"{qid}-a", f"{qid}-b", f"{qid}-c", f"{qid}-d"]
    return {"id": qid, "lesson_id": lesson, "topic_id": topic, "objective_id": obj, "text": f"Câu {qid}",
            "options": opts, "correct": correct, "misconceptions": mis or {},
            "source": {"version_id": "v1", "document_title": "Bai 1", "page": 3, "page_end": None}}  # fmt: skip


def test_grade_by_topic_and_objective_unanswered_is_not_wrong():
    qs = [q("q1", "L1.T1", "L1.T1.O1"), q("q2", "L1.T1", "L1.T1.O2"), q("q3", "L1.T2", "L1.T2.O1")]
    g = diagnosis.grade(qs, {"q1": 0, "q2": 2, "q3": True})  # bool không phải lựa chọn hợp lệ
    t1 = g["topics"]["L1.T1"]
    assert (t1["answered"], t1["correct"]) == (2, 1)
    assert t1["objectives"]["L1.T1.O2"] == {"total": 1, "answered": 1, "correct": 0}
    assert g["topics"]["L1.T2"]["answered"] == 0  # chưa trả lời → chưa đủ dữ liệu, không phải sai


def test_mastery_accumulates_with_decay_and_confidence():
    o = lambda c, a: {"correct": c, "answered": a, "objectives": {"x": {"correct": c, "answered": a}}}  # noqa: E731
    first = diagnosis.update_mastery(None, o(0, 2), "a1", "t1")
    assert first["level"] == "missing_foundation" and first["confidence"] == "medium"
    second = diagnosis.update_mastery(first, o(3, 3), "a2", "t2")
    assert second["mastery"] == pytest.approx(3 / 4) and second["level"] == "needs_reinforcement"
    assert [h["assessment_id"] for h in second["history"]] == ["a1", "a2"]
    assert diagnosis.update_mastery(second, o(0, 0), "a3", "t3") is second  # không trả lời → giữ nguyên
    assert diagnosis.update_mastery(None, o(1, 1), "a", "t")["confidence"] == "low"  # 1 câu: chưa chắc


def test_diagnose_explains_gap_with_misconception_review_and_root_cause(cur):
    qs = [
        q("q1", "L1.T1", "L1.T1.O1", mis={"q1-c": "Cho rằng các pha chạy song song"}),
        q("q2", "L1.T1", "L1.T1.O2"),
        q("q3", "L2.T1", "L2.T1.O1", lesson="L2"),
        q("q4", "L1.T2", "L1.T2.O1"),
    ]
    g = diagnosis.grade(qs, {"q1": 2, "q2": 0, "q3": 1, "q4": 0})
    after = {tid: diagnosis.update_mastery(None, o, "a1", "t") for tid, o in g["topics"].items()}
    res = diagnosis.diagnose(cur, qs, g, after, diagnosis.source_refs(qs))
    gaps = {x["topic_id"]: x for x in res["gaps"]}
    assert set(gaps) == {"L1.T1", "L2.T1"}
    g1 = gaps["L1.T1"]
    assert g1["missing_concepts"] == ["Nêu các pha của thác nước"]  # chỉ mục tiêu chưa đạt
    assert g1["evidence"][0]["indicates"] == "Cho rằng các pha chạy song song"
    assert g1["evidence"][0]["picked_text"] == "q1-c" and g1["evidence"][0]["correct_text"] == "q1-a"
    assert g1["review"]["lesson_title"] == "Quy trình phần mềm" and g1["review"]["sources"][0]["page"] == 3
    assert gaps["L2.T1"]["root_causes"] == [
        {"topic_id": "L1.T1", "title": "Mô hình thác nước", "lesson_title": "Quy trình phần mềm"}
    ]
    assert res["gaps"][0]["level"] == "missing_foundation"
    assert res["summary"] == {"total": 4, "answered": 4, "correct": 2, "score_pct": 50}
    assert [x["lesson_id"] for x in res["lessons"]] == ["L1", "L2"]


def test_recommendations_reference_real_topics_and_block_next_lesson(cur):
    mastery = {"L1.T1": m("solid", 1.0), "L1.T2": m("solid", 1.0), "L2.T1": m("missing_foundation", 0.0)}
    recs = diagnosis.recommendations(cur, {"L1", "L2"}, mastery, {})
    texts = " ".join(r["text"] for r in recs)
    assert "Ôn lại nền tảng “Yêu cầu chức năng” (bài 2: Yêu cầu phần mềm)" in texts
    assert any(r["kind"] == "next_lesson_blocked" and r["lesson_id"] == "L3" for r in recs)
    good = diagnosis.recommendations(cur, {"L1"}, {"L1.T1": m("solid", 1.0), "L1.T2": m("solid", 1.0)}, {})
    assert good[-1] == {
        "kind": "next_lesson",
        "lesson_id": "L2",
        "text": "Nền tảng đủ để học tiếp bài 2: Yêu cầu phần mềm.",
    }


def test_recommendations_report_progress_from_previous_results(cur):
    hist = [{"assessment_id": "a1", "correct": 0, "answered": 2}, {"assessment_id": "a2", "correct": 2, "answered": 2}]
    recs = diagnosis.recommendations(cur, {"L1"}, {"L1.T1": {**m("needs_reinforcement", 0.67), "history": hist}}, {})
    assert any(r["kind"] == "progress" and "0% → 100%" in r["text"] for r in recs)


# ---------------------------------------------------------------- lộ trình


def kinds(r):
    return [(s["kind"], s["topic_ids"] if s["kind"] != "learn" else s["completes_lesson"]) for s in r["steps"]]


def test_foundation_first_reviews_prerequisites_before_dependents_then_new_lesson(cur):
    mastery = {"L1.T1": m("needs_reinforcement"), "L1.T2": m("solid"), "L2.T1": m("missing_foundation")}
    r = roadmap.build_roadmap(cur, {"L1", "L2"}, mastery, "foundation_first")
    assert kinds(r) == [
        ("reinforce", ["L1.T1"]), ("review", ["L2.T1"]), ("checkpoint", ["L1.T1", "L2.T1"]),
        ("learn", "L3"), ("checkpoint", ["L3.T1"]),
    ]  # fmt: skip
    assert [s["order"] for s in r["steps"]] == [1, 2, 3, 4, 5]
    assert [a["type"] for a in r["steps"][1]["activities"]] == ["read", "find", "explain", "flashcards", "cloze"]
    assert r["summary"]["new_lessons"] == ["Thiết kế"]
    learn = next(x for x in r["steps"] if x["kind"] == "learn")
    assert roadmap.gate_of(r["steps"], learn)["id"] == r["steps"][2]["id"]  # bài mới chờ đạt bài kiểm tra trước


def test_continue_with_gaps_reviews_prerequisites_first_then_interleaves(cur):
    mastery = {"L1.T1": m("needs_reinforcement"), "L1.T2": m("needs_reinforcement"), "L2.T1": m("missing_foundation")}
    r = roadmap.build_roadmap(cur, {"L1", "L2"}, mastery, "continue_with_gaps")
    ks = kinds(r)
    assert ks[0] == ("review", ["L2.T1"])  # L3.T1 cần L2.T1 → ôn trước khi học bài 3
    assert ks[1][0] == "checkpoint" and ks[2] == ("learn", "L3")
    assert ("reinforce", ["L1.T1"]) in ks[3:] and ks[-1][0] == "checkpoint"
    gate = r["steps"][1]
    assert gate["assessment"]["topic_ids"] == ["L2.T1"]
    learn = r["steps"][2]
    assert roadmap.gate_of(r["steps"], learn)["id"] == gate["id"] and not roadmap.gate_open(r["steps"], learn)
    after = next(s for s in r["steps"] if s["kind"] == "checkpoint" and s["order"] > learn["order"])
    assert "L3.T1" in after["assessment"]["topic_ids"]


def test_intensive_review_gates_new_lesson_behind_full_checkpoint(cur):
    mastery = {"L1.T1": m("missing_foundation"), "L1.T2": m("solid")}
    r = roadmap.build_roadmap(cur, {"L1", "L2"}, mastery, "intensive_review")
    steps = r["steps"]
    gate = next(s for s in steps if s["kind"] == "checkpoint")
    assert set(gate["assessment"]["topic_ids"]) == {"L1.T1", "L1.T2", "L2.T1"}
    learn = next(s for s in steps if s["kind"] == "learn")
    assert roadmap.gate_of(steps, learn)["id"] == gate["id"] and learn["order"] > gate["order"]
    assert not roadmap.gate_open(steps, learn)
    assert any(s["kind"] == "refresh" and "L1.T2" in s["topic_ids"] for s in steps)


def test_roadmap_never_checks_unlearned_lessons_except_after_learn_step(cur):
    for strategy in roadmap.STRATEGIES:
        r = roadmap.build_roadmap(cur, {"L1"}, {"L1.T1": m("missing_foundation")}, strategy)
        learned = {"L1"}
        for s in r["steps"]:
            if s["kind"] == "learn":
                learned.add(s["completes_lesson"])
            if s["kind"] == "checkpoint":
                assert {cur.topic(t).lesson_id for t in s["assessment"]["topic_ids"]} <= learned, strategy


@pytest.mark.parametrize(
    "mastery, covered, expected",
    [
        ({"L1.T1": m("missing_foundation"), "L1.T2": m("missing_foundation"), "L2.T1": m("solid")}, {"L1", "L2"},
         "intensive_review"),
        ({"L1.T1": m("solid"), "L1.T2": m("solid"), "L2.T1": m("needs_reinforcement")}, {"L1", "L2"},
         "foundation_first"),
        ({"L1.T1": m("solid"), "L1.T2": m("needs_reinforcement")}, {"L1"}, "continue_with_gaps"),
    ],
)  # fmt: skip
def test_recommended_strategy(cur, mastery, covered, expected):
    options = roadmap.path_options(cur, covered, mastery)
    assert [o["strategy"] for o in options if o["recommended"]] == [expected]
    # 1–3 phương án: phương án vô nghĩa hoặc ra đúng các bước như phương án khác bị bỏ, đề xuất luôn còn và đứng đầu
    assert options[0]["recommended"] and options[0]["rationale"] and 1 <= len(options) <= 3
    assert len({o["strategy"] for o in options}) == len(options) and all(o["preview"] for o in options)


def test_failed_checkpoint_inserts_remediation_round_and_regates_new_lesson(cur):
    mastery = {"L1.T1": m("missing_foundation"), "L1.T2": m("solid")}
    steps = roadmap.build_roadmap(cur, {"L1", "L2"}, mastery, "foundation_first")["steps"]
    check = next(s for s in steps if s["kind"] == "checkpoint")
    check |= {"status": "done", "result": {"passed": False}}
    after = {"L1.T1": m("needs_reinforcement", 0.6), "L1.T2": m("solid", 1.0), "L2.T1": m("solid", 0.9)}
    check["assessment"]["topic_ids"] = ["L1.T1", "L1.T2", "L2.T1"]
    new = roadmap.remediation(cur, steps, check, after, concepts={"L1.T1": ["Các pha chạy tuần tự"]})
    assert [(s["kind"], s["topic_ids"]) for s in new] == [("reinforce", ["L1.T1"]), ("checkpoint", ["L1.T1"])]
    assert new[0]["remediation"] == 1 and new[1]["round"] == 1 and new[1]["remediation_for"] == check["id"]
    assert new[0]["concepts"][0] == "Các pha chạy tuần tự"
    assert not {s["id"] for s in new} & {s["id"] for s in steps}  # id mới không trùng
    merged = roadmap.splice_after(steps, check["id"], new)
    assert [s["order"] for s in merged] == list(range(1, len(merged) + 1))
    learn = next(s for s in merged if s["kind"] == "learn")
    assert roadmap.gate_of(merged, learn)["id"] == new[1]["id"] and not roadmap.gate_open(merged, learn)
    new[1] |= {"status": "done", "result": {"passed": True}}
    assert roadmap.gate_open(merged, learn)
    # vòng tiếp theo đánh số lần 2
    again = roadmap.remediation(cur, merged, new[1] | {"result": {"passed": False}}, after)
    assert again[0]["title"].startswith("Ôn lại (lần 2)")


def test_topic_concepts_prefer_missed_answers_then_objectives(cur):
    qs = [q("q1", "L1.T1", "L1.T1.O1"), q("q2", "L1.T1", "L1.T1.O2"), q("q3", "L1.T2", "L1.T2.O1")]
    concepts = diagnosis.topic_concepts(cur, qs, {"q1": 2, "q2": 0})
    assert concepts["L1.T1"][0] == "q1-a"  # nội dung đúng của câu đã sai
    assert concepts["L1.T1"][1:] == ["Nêu các pha của thác nước", "Chỉ ra hạn chế của thác nước"]
    assert "q2-a" not in concepts["L1.T1"]  # câu làm đúng không phải chỗ hổng
    assert "L1.T2" not in concepts  # mục tiêu mặc định = tên chủ đề → builder tự thêm tên chủ đề


def test_derived_topic_query_expands_abbreviations():
    from src.services.learning_path.curriculum import expand_abbreviations

    assert expand_abbreviations("Vai trò của PM") == "Vai trò của PM (phần mềm)"
    assert (
        expand_abbreviations("Khái niệm SP Phần mềm, HTTT")
        == "Khái niệm SP Phần mềm, HTTT (sản phẩm, hệ thống thông tin)"
    )
    assert expand_abbreviations("Mô hình thác nước") == "Mô hình thác nước"  # không có viết tắt → giữ nguyên
    c = derive("SE101", [{"chapter": "1", "title": "Tổng quan", "sections": ["Vai trò của PM"], "document": "x",
                          "kind": "lesson", "document_id": "d1"}])  # fmt: skip
    t = c.lessons[0].topics[0]
    assert t.title == "Vai trò của PM" and t.query == "Tổng quan: Vai trò của PM (phần mềm)"
