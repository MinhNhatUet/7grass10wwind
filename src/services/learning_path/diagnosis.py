"""Chấm và chẩn đoán bài đánh giá theo tiến độ — hàm thuần, không DB/LLM (D-82).

- Chấm bằng code theo đáp án đã lưu (không nhờ LLM chấm): đúng/sai từng câu → theo MỤC TIÊU → CHỦ ĐỀ → BÀI.
- Câu chưa trả lời = chưa đủ dữ liệu, không tính là sai (FR-03.3); không kết luận "đã nắm" cho phần chưa kiểm tra.
- Mức nắm vững cộng dồn qua các lần: kết quả cũ giảm trọng số DECAY mỗi lần đánh giá chủ đề đó → lần gần nhất quyết
  định nhiều nhất nhưng một câu may/rủi không xóa hết lịch sử.
- Lỗ hổng nêu: khái niệm/mục tiêu còn thiếu, VÌ SAO (phương án sai đã chọn và hiểu nhầm mà phương án đó đại diện), cần
  xem lại bài/chủ đề/trang nào — tất cả lấy từ đề cương và nguồn thật của câu hỏi, không bịa.
"""

from __future__ import annotations

import re
from typing import Any

from src.services.learning_path.curriculum import Curriculum

DECAY = 0.5
SOLID, REINFORCE, MISSING, INSUFFICIENT = "solid", "needs_reinforcement", "missing_foundation", "insufficient_data"
LEVELS = (SOLID, REINFORCE, MISSING, INSUFFICIENT)
LEVEL_LABEL = {
    SOLID: "đã vững",
    REINFORCE: "cần củng cố",
    MISSING: "thiếu nền tảng",
    INSUFFICIENT: "chưa đủ dữ liệu",
}
WEAK = (MISSING, REINFORCE)
HISTORY_MAX = 10


def classify(mastery: float | None) -> str:
    if mastery is None:
        return INSUFFICIENT
    if mastery >= 0.8:
        return SOLID
    return REINFORCE if mastery >= 0.5 else MISSING


def confidence(answered: float) -> str:
    """Độ tin của ước lượng theo lượng bằng chứng (đã giảm trọng số): 1 câu không đủ để chắc chắn."""
    return "low" if answered < 2 else "medium" if answered < 4 else "high"


def picked_index(raw: Any) -> int | None:
    return raw if isinstance(raw, int) and not isinstance(raw, bool) and 0 <= raw <= 3 else None


def grade(questions: list[dict[str, Any]], answers: dict[str, Any], skip: set[str] | None = None) -> dict[str, Any]:
    """Kết quả thô từng câu + gộp theo chủ đề/mục tiêu. `skip`: câu bị loại (nguồn mất quyền) — không chấm."""
    skip = skip or set()
    items, topics = [], {}
    for q in questions:
        if q["id"] in skip:
            continue
        picked = picked_index(answers.get(q["id"]))
        ok = picked is not None and picked == q["correct"]
        items.append({"id": q["id"], "topic_id": q["topic_id"], "objective_id": q["objective_id"],
                      "lesson_id": q["lesson_id"], "picked": picked, "answered": picked is not None, "correct": ok})  # fmt: skip
        t = topics.setdefault(q["topic_id"], {"total": 0, "answered": 0, "correct": 0, "objectives": {}})
        o = t["objectives"].setdefault(q["objective_id"], {"total": 0, "answered": 0, "correct": 0})
        for bucket in (t, o):
            bucket["total"] += 1
            bucket["answered"] += picked is not None
            bucket["correct"] += ok
    return {"items": items, "topics": topics}


def update_mastery(prev: dict[str, Any] | None, outcome: dict[str, Any], assessment_id: str, at: str) -> dict[str, Any]:
    """Cộng dồn có giảm trọng số. Chủ đề không có câu nào được trả lời ở lần này → giữ nguyên trạng thái cũ."""
    prev = prev or {"correct": 0.0, "answered": 0.0, "objectives": {}, "history": []}
    if outcome["answered"] == 0:
        return prev
    correct = prev["correct"] * DECAY + outcome["correct"]
    answered = prev["answered"] * DECAY + outcome["answered"]
    objectives = {k: {"correct": v["correct"] * DECAY, "answered": v["answered"] * DECAY}
                  for k, v in (prev.get("objectives") or {}).items()}  # fmt: skip
    for oid, o in outcome["objectives"].items():
        cur = objectives.setdefault(oid, {"correct": 0.0, "answered": 0.0})
        cur["correct"] += o["correct"]
        cur["answered"] += o["answered"]
    mastery = correct / answered
    history = [*(prev.get("history") or []), {"assessment_id": assessment_id, "at": at,
                                               "correct": outcome["correct"], "answered": outcome["answered"]}]  # fmt: skip
    return {
        "correct": round(correct, 4), "answered": round(answered, 4), "mastery": round(mastery, 4),
        "level": classify(mastery), "confidence": confidence(answered), "objectives": objectives,
        "history": history[-HISTORY_MAX:], "last_assessment_id": assessment_id,
    }  # fmt: skip


def _objective_status(o: dict[str, int]) -> str:
    if o["answered"] == 0:
        return "not_answered"
    if o["correct"] == o["answered"]:
        return "met"
    return "partial" if o["correct"] else "not_met"


def _option_text(q: dict[str, Any], i: int | None) -> str:
    return q["options"][i] if i is not None and 0 <= i < len(q.get("options") or []) else ""


def _evidence(q: dict[str, Any], picked: int, objective_text: str) -> dict[str, Any]:
    picked_text = _option_text(q, picked)
    hint = str((q.get("misconceptions") or {}).get(picked_text) or "").strip()
    indicates = hint or f"Phương án đã chọn không đáp ứng mục tiêu “{objective_text}”."
    return {"question_id": q["id"], "question": q["text"], "picked_text": picked_text,
            "correct_text": _option_text(q, q["correct"]), "indicates": indicates}  # fmt: skip


def source_refs(questions: list[dict[str, Any]], skip: set[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    """Nguồn thật (tài liệu + trang + đoạn dẫn chứng) của câu hỏi theo chủ đề — để chỉ chỗ cần đọc lại. Đoạn dẫn
    chứng = câu trích nguyên văn đã kiểm có trong tài liệu (D-74); mỗi (bản, trang) một mục."""
    refs: dict[str, list[dict[str, Any]]] = {}
    for q in questions:
        src = q.get("source")
        if not src or q["id"] in (skip or set()):
            continue
        bucket = refs.setdefault(q["topic_id"], [])
        if any(r["version_id"] == src.get("version_id") and r["page"] == src.get("page") for r in bucket):
            continue
        ref = {k: src.get(k) for k in ("document_id", "version_id", "document_title", "page", "page_end")}
        bucket.append(ref | {"quote": str(q.get("proof") or "")})
    return refs


def diagnose(
    curriculum: Curriculum,
    questions: list[dict[str, Any]],
    graded: dict[str, Any],
    mastery_after: dict[str, dict[str, Any]],
    refs: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Kết quả theo bài/chủ đề/mục tiêu + danh sách lỗ hổng có giải thích."""
    by_id = {q["id"]: q for q in questions}
    topics_out, gaps = [], []
    for topic_id, t in graded["topics"].items():
        topic = curriculum.topic(topic_id)
        if topic is None:
            continue
        lesson = curriculum.lesson_of(topic)
        m = mastery_after.get(topic_id) or {}
        attempt_level = classify(t["correct"] / t["answered"]) if t["answered"] else INSUFFICIENT
        level = m.get("level", INSUFFICIENT) if t["answered"] else INSUFFICIENT
        obj_text = {o.id: o.text for o in topic.objectives}
        objectives = [{"id": oid, "text": obj_text.get(oid, oid), **o, "status": _objective_status(o)}
                      for oid, o in t["objectives"].items()]  # fmt: skip
        topics_out.append({
            "topic_id": topic_id, "title": topic.title, "lesson_id": lesson.id, "lesson_title": lesson.title,
            "lesson_order": lesson.order, "total": t["total"], "answered": t["answered"], "correct": t["correct"],
            "attempt_level": attempt_level, "level": level, "mastery": m.get("mastery") if t["answered"] else None,
            "confidence": m.get("confidence", "low"), "objectives": objectives,
        })  # fmt: skip
        if level not in WEAK:
            continue
        wrong = [i for i in graded["items"] if i["topic_id"] == topic_id and i["answered"] and not i["correct"]]
        evidence = [_evidence(by_id[i["id"]], i["picked"], obj_text.get(i["objective_id"], topic.title)) for i in wrong]
        missing = [o["text"] for o in objectives if o["status"] in ("not_met", "partial")] or [
            o.text for o in topic.objectives
        ]
        weak_prereqs = [p for p in topic.prerequisites if (mastery_after.get(p) or {}).get("level") in WEAK]
        why = (
            f"Sai {len(wrong)}/{t['answered']} câu đã trả lời về chủ đề này."
            if wrong
            else "Lần này trả lời đúng nhưng kết quả các lần trước còn yếu — cần thêm bằng chứng trước khi coi là vững."
        )
        gaps.append({
            "topic_id": topic_id, "topic_title": topic.title, "lesson_id": lesson.id, "lesson_title": lesson.title,
            "lesson_order": lesson.order, "level": level, "mastery": m.get("mastery"), "missing_concepts": missing,
            "why": why, "evidence": evidence,
            "review": {"lesson_id": lesson.id, "lesson_title": lesson.title, "topic_title": topic.title,
                       "sources": refs.get(topic_id) or _lesson_ref(lesson)},
            "root_causes": [{"topic_id": p, "title": pt.title, "lesson_title": curriculum.lesson_of(pt).title}
                            for p in weak_prereqs if (pt := curriculum.topic(p))],
        })  # fmt: skip
    topics_out.sort(key=lambda x: (x["lesson_order"], x["title"]))
    gaps.sort(key=lambda g: (g["level"] != MISSING, g["lesson_order"]))
    lessons: dict[str, dict[str, Any]] = {}
    for x in topics_out:
        agg = lessons.setdefault(x["lesson_id"], {"lesson_id": x["lesson_id"], "title": x["lesson_title"],
                                                  "order": x["lesson_order"], "total": 0, "answered": 0, "correct": 0})  # fmt: skip
        for k in ("total", "answered", "correct"):
            agg[k] += x[k]
    for agg in lessons.values():
        agg["level"] = classify(agg["correct"] / agg["answered"]) if agg["answered"] else INSUFFICIENT
    items = graded["items"]
    answered = sum(i["answered"] for i in items)
    correct = sum(i["correct"] for i in items)
    return {
        "summary": {
            "total": len(items),
            "answered": answered,
            "correct": correct,
            "score_pct": round(100 * correct / answered) if answered else None,
        },  # fmt: skip
        "lessons": sorted(lessons.values(), key=lambda x: x["order"]),
        "topics": topics_out,
        "gaps": gaps,
    }


def _lesson_ref(lesson: Any) -> list[dict[str, Any]]:
    if not lesson.document_title:
        return []
    return [lesson_ref(lesson)]


def lesson_ref(lesson: Any) -> dict[str, Any]:
    """Nguồn mức bài (trang đầu bài trong tài liệu của bài) khi chưa có câu hỏi nào chỉ ra trang cụ thể."""
    return {"document_id": lesson.document_id, "version_id": None, "document_title": lesson.document_title,
            "page": lesson.page, "page_end": None, "quote": ""}  # fmt: skip


def recommendations(
    curriculum: Curriculum,
    covered: set[str],
    mastery: dict[str, dict[str, Any]],
    refs: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Gợi ý cá nhân hóa theo mức nắm vững CỘNG DỒN (gồm cả các lần trước) trên phạm vi đã học."""
    out: list[dict[str, Any]] = []
    in_scope = curriculum.topics(covered)
    for level, verb in ((MISSING, "Ôn lại nền tảng"), (REINFORCE, "Luyện thêm")):
        for t in (t for t in in_scope if (mastery.get(t.id) or {}).get("level") == level):
            lesson = curriculum.lesson_of(t)
            how = "đọc lại lý thuyết, làm thẻ ghi nhớ và điền khuyết" if level == MISSING else "làm trắc nghiệm tự ôn"
            # nguồn tách riêng (không ghép vào câu) → giao diện hiện thành trích dẫn bấm mở trang; kiểm quyền lúc trả
            out.append({"kind": level, "topic_id": t.id, "lesson_id": lesson.id,
                        "text": f"{verb} “{t.title}” (bài {lesson.order}: {lesson.title}) — {how}.",
                        "sources": (refs.get(t.id) or _lesson_ref(lesson))[:2]})  # fmt: skip
    unknown = [t for t in in_scope if (mastery.get(t.id) or {}).get("level", INSUFFICIENT) == INSUFFICIENT]
    if unknown:
        names = ", ".join(f"“{t.title}”" for t in unknown[:5]) + ("…" if len(unknown) > 5 else "")
        out.append({"kind": INSUFFICIENT, "topic_ids": [t.id for t in unknown],
                    "text": f"Chưa đủ dữ liệu về {names} — sẽ được đưa vào bài kiểm tra tiếp theo."})  # fmt: skip
    for t in in_scope:
        hist = (mastery.get(t.id) or {}).get("history") or []
        if len(hist) >= 2 and hist[-2]["answered"] and hist[-1]["answered"]:
            before, after = hist[-2]["correct"] / hist[-2]["answered"], hist[-1]["correct"] / hist[-1]["answered"]
            if after - before >= 0.34:
                out.append({"kind": "progress", "topic_id": t.id,
                            "text": f"Tiến bộ ở “{t.title}”: {round(before * 100)}% → {round(after * 100)}% so với lần trước."})  # fmt: skip
            elif before - after >= 0.34:
                out.append({"kind": "regression", "topic_id": t.id,
                            "text": f"“{t.title}” giảm từ {round(before * 100)}% xuống {round(after * 100)}% — nên ôn lại sớm."})  # fmt: skip
    upcoming = curriculum.next_lessons(covered)
    if upcoming:
        nxt = upcoming[0]
        blockers = prerequisite_gaps(curriculum, covered, mastery, nxt)
        if blockers:
            names = ", ".join(f"“{t.title}”" for t in blockers)
            out.append({"kind": "next_lesson_blocked", "lesson_id": nxt.id,
                        "text": f"Trước khi học bài {nxt.order}: {nxt.title}, nên vững {names}."})  # fmt: skip
        elif not any(o["kind"] == MISSING for o in out):
            out.append({"kind": "next_lesson", "lesson_id": nxt.id,
                        "text": f"Nền tảng đủ để học tiếp bài {nxt.order}: {nxt.title}."})  # fmt: skip
    elif in_scope and all((mastery.get(t.id) or {}).get("level") == SOLID for t in in_scope):
        out.append({"kind": "complete", "text": "Bạn đã học hết và vững toàn bộ các bài của môn."})
    return out


def prerequisite_topics(curriculum: Curriculum, covered: set[str], lesson: Any) -> list:
    """Chủ đề (đã học) mà bài `lesson` phụ thuộc. Đề cương có khai báo tiên quyết → dùng đúng khai báo; không có (chương
    trình suy ra) → giả định bài liền trước là nền của bài sau (đề xuất, FR-03.6)."""
    explicit = {p for t in lesson.topics for p in t.prerequisites}
    if explicit:
        return [t for t in curriculum.topics(covered) if t.id in explicit]
    prev = [x for x in curriculum.lessons if x.order == lesson.order - 1 and x.id in covered]
    return list(prev[0].topics) if prev else []


def prerequisite_gaps(
    curriculum: Curriculum, covered: set[str], mastery: dict[str, dict[str, Any]], lesson: Any
) -> list:
    """Chủ đề nền của bài `lesson` mà người học còn yếu."""
    return [
        t for t in prerequisite_topics(curriculum, covered, lesson) if (mastery.get(t.id) or {}).get("level") in WEAK
    ]


_TEMPLATE_OBJECTIVE = re.compile(r"^(?:Trình bày và vận dụng được|Hiểu và vận dụng được)\s*:\s*", re.I)
CONCEPT_MAX = 6


def topic_concepts(
    curriculum: Curriculum, questions: list[dict[str, Any]], answers: dict[str, Any], skip: set[str] | None = None
) -> dict[str, list[str]]:
    """Khái niệm cụ thể theo chủ đề để người học CHỌN khi nhờ trợ lý giải thích: trước hết nội dung đúng của các câu
    vừa làm sai (đúng chỗ hổng), rồi mục tiêu học tập (bỏ tiền tố mẫu của chương trình suy ra). Không gọi LLM."""
    out: dict[str, list[str]] = {}
    for q in questions:
        if q["id"] in (skip or set()):
            continue
        picked = picked_index(answers.get(q["id"]))
        if picked is not None and picked != q["correct"]:
            text = _option_text(q, q["correct"]).strip()
            if text:
                out.setdefault(q["topic_id"], []).append(text[:160])
    for t in curriculum.topics():
        objs = [_TEMPLATE_OBJECTIVE.sub("", o.text).strip() for o in t.objectives]
        merged = list(dict.fromkeys([*out.get(t.id, []), *(o for o in objs if o and o != t.title)]))
        if merged:
            out[t.id] = merged[:CONCEPT_MAX]
    return out
