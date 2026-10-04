"""Lựa chọn lộ trình và dựng lộ trình cụ thể sau đánh giá — hàm thuần, không DB/LLM (D-82).

Ba chiến lược, cùng một đầu vào (chương trình học, phạm vi đã học, mức nắm vững cộng dồn, nguồn theo chủ đề):
- foundation_first   — ôn hết chủ đề hổng theo thứ tự đề cương (nền trước phần phụ thuộc) → kiểm tra lại → học bài mới.
- continue_with_gaps — giữ nhịp lớp: ôn trước chủ đề nền mà bài kế tiếp cần, học bài mới, xen kẽ vá các lỗ hổng còn lại.
- intensive_review   — ôn toàn bộ phạm vi đã học (yếu trước, vững sau) → kiểm tra tổng (đạt mới mở bài mới).

Mỗi bước có thứ tự, bài/chủ đề/mục tiêu thật của đề cương, hoạt động học (ánh xạ sang công cụ học có sẵn: giải thích,
thẻ ghi nhớ, điền khuyết, trắc nghiệm tự ôn), nguồn/trang cần đọc khi có, thời lượng ước tính; checkpoint mang phạm vi
bài kiểm tra tiếp theo (chỉ gồm chủ đề — bài mới chỉ được kiểm tra sau khi người học đánh dấu đã học bài đó).
"""

from __future__ import annotations

from typing import Any

from src.services.learning_path.curriculum import Curriculum, Lesson, Topic
from src.services.learning_path.diagnosis import INSUFFICIENT, MISSING, REINFORCE, SOLID, prerequisite_gaps

STRATEGIES: dict[str, dict[str, str]] = {
    "foundation_first": {
        "title": "Củng cố nền tảng trước",
        "description": "Ôn hết các chủ đề còn hổng theo thứ tự bài, làm bài kiểm tra lại, rồi mới học bài mới.",
        "suits": "Khi còn lỗ hổng ở kiến thức nền mà các bài sau phụ thuộc.",
    },
    "continue_with_gaps": {
        "title": "Học tiếp, vá lỗ hổng song song",
        "description": "Giữ nhịp lớp học: ôn trước phần nền bài kế tiếp cần, học bài mới và xen kẽ ôn các chủ đề yếu.",
        "suits": "Khi phần lớn đã vững, chỉ còn vài chủ đề cần củng cố.",
    },
    "intensive_review": {
        "title": "Ôn tập chuyên sâu trước khi học tiếp",
        "description": "Ôn toàn bộ phạm vi đã học (yếu trước, vững sau), làm bài kiểm tra tổng; đạt mới học bài mới.",
        "suits": "Khi nhiều chủ đề đã học còn yếu, hoặc trước kỳ thi.",
    },
}
LOOKAHEAD_LESSONS = 2
PASS_MASTERY = 0.8
MINUTES = {"review": 40, "reinforce": 25, "refresh": 15, "learn": 45, "checkpoint": 15}


def _act(kind: str, label: str) -> dict[str, str]:
    return {"type": kind, "label": label}


def _refs_for(topics: list[Topic], lesson: Lesson, refs: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for t in topics:
        for r in refs.get(t.id, []):
            if r not in out:
                out.append(r)
    if not out and lesson.document_title:
        out.append({"version_id": None, "document_title": lesson.document_title, "page": lesson.page, "page_end": None})
    return out[:4]


class _Builder:
    def __init__(self, curriculum: Curriculum, refs: dict[str, list[dict[str, Any]]]) -> None:
        self.c, self.refs, self.steps = curriculum, refs, []

    def _add(
        self, kind: str, title: str, lesson: Lesson | None, topics: list[Topic], activities: list, **extra: Any
    ) -> str:
        sid = f"st{len(self.steps) + 1}"
        self.steps.append({
            "id": sid, "order": len(self.steps) + 1, "kind": kind, "title": title,
            "lesson_id": lesson.id if lesson else None, "lesson_title": lesson.title if lesson else None,
            "topic_ids": [t.id for t in topics], "topic_titles": [t.title for t in topics],
            "objectives": [o.text for t in topics for o in t.objectives],
            "activities": activities, "sources": _refs_for(topics, lesson, self.refs) if lesson else [],
            "minutes": MINUTES[kind] if kind != "refresh" else MINUTES[kind] * max(1, len(topics) // 3 + 1),
            "status": "not_started", **extra,
        })  # fmt: skip
        return sid

    def gap(self, t: Topic, level: str) -> str:
        lesson = self.c.lesson_of(t)
        if level == MISSING:
            acts = [_act("read", f"Đọc lại lý thuyết “{t.title}” trong bài {lesson.order}"),
                    _act("explain", "Nhờ trợ lý giải thích từng bước phần chưa rõ"),
                    _act("flashcards", "Làm thẻ ghi nhớ các khái niệm cốt lõi"),
                    _act("cloze", "Làm câu điền khuyết để kiểm tra lại thuật ngữ")]  # fmt: skip
            return self._add("review", f"Ôn nền tảng: {t.title}", lesson, [t], acts, level=level)
        acts = [_act("mcq", f"Làm trắc nghiệm tự ôn về “{t.title}”"),
                _act("explain", "Xem lại giải thích các câu đã sai")]  # fmt: skip
        return self._add("reinforce", f"Củng cố: {t.title}", lesson, [t], acts, level=level)

    def refresh(self, lesson: Lesson, topics: list[Topic]) -> str:
        acts = [_act("flashcards", f"Ôn nhanh bằng thẻ ghi nhớ bài {lesson.order}")]
        return self._add("refresh", f"Ôn nhanh bài {lesson.order}: {lesson.title}", lesson, topics, acts)

    def learn(self, lesson: Lesson, requires: str | None = None) -> str:
        acts = [_act("read", f"Học bài {lesson.order}: {lesson.title}"),
                _act("explain", "Hỏi trợ lý phần chưa hiểu (giải thích từng bước)"),
                _act("quiz", "Tự kiểm tra nhanh sau khi học")]  # fmt: skip
        extra: dict[str, Any] = {"completes_lesson": lesson.id}
        if requires:
            extra["requires"] = requires
            extra["unlock"] = f"Đạt ≥ {round(PASS_MASTERY * 100)}% ở bài kiểm tra trước đó"
        return self._add("learn", f"Học bài mới: {lesson.title}", lesson, list(lesson.topics), acts, **extra)

    def checkpoint(self, topics: list[Topic], title: str) -> str | None:
        uniq = list({t.id: t for t in topics}.values())
        if not uniq:
            return None
        acts = [_act("assessment", f"Làm bài kiểm tra {len(uniq)} chủ đề — chỉ trong phạm vi đã học")]
        return self._add("checkpoint", title, None, uniq, acts,
                         assessment={"topic_ids": [t.id for t in uniq], "pass_mastery": PASS_MASTERY})  # fmt: skip


def _classify(curriculum: Curriculum, covered: set[str], mastery: dict[str, dict[str, Any]]) -> dict[str, list[Topic]]:
    groups: dict[str, list[Topic]] = {MISSING: [], REINFORCE: [], INSUFFICIENT: [], SOLID: []}
    for t in curriculum.topics(covered):  # thứ tự đề cương → bài trước (nền) đứng trước
        groups[(mastery.get(t.id) or {}).get("level", INSUFFICIENT)].append(t)
    return groups


def build_roadmap(
    curriculum: Curriculum,
    covered: set[str],
    mastery: dict[str, dict[str, Any]],
    strategy: str,
    refs: dict[str, list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    if strategy not in STRATEGIES:
        raise ValueError(strategy)
    g = _classify(curriculum, covered, mastery)
    # theo thứ tự đề cương (tiên quyết luôn khai báo trước → thứ tự tô-pô): nền của chủ đề sau được ôn trước nó
    levels = {t.id: lv for lv in (MISSING, REINFORCE) for t in g[lv]}
    weak = [(t, levels[t.id]) for t in curriculum.topics(covered) if t.id in levels]
    upcoming = curriculum.next_lessons(covered)[:LOOKAHEAD_LESSONS]
    b = _Builder(curriculum, refs or {})

    if strategy == "foundation_first":
        for t, level in weak:
            b.gap(t, level)
        b.checkpoint([t for t, _ in weak] + g[INSUFFICIENT], "Kiểm tra lại các chủ đề vừa ôn")
        if upcoming:
            b.learn(upcoming[0])
            b.checkpoint(list(upcoming[0].topics), f"Kiểm tra bài {upcoming[0].order}: {upcoming[0].title}")
    elif strategy == "continue_with_gaps":
        first = {t.id for t in prerequisite_gaps(curriculum, covered, mastery, upcoming[0])} if upcoming else set()
        for t, level in weak:
            if t.id in first:
                b.gap(t, level)
        rest = [(t, level) for t, level in weak if t.id not in first]
        for lesson in upcoming:
            b.learn(lesson)
            patch, rest = rest[:2], rest[2:]
            for t, level in patch:
                b.gap(t, level)
            prereq = [t for t, _ in weak if t.id in first] if lesson is upcoming[0] else []
            b.checkpoint(list(lesson.topics) + [t for t, _ in patch] + prereq,
                         f"Kiểm tra bài {lesson.order}: {lesson.title} và chủ đề vừa ôn")  # fmt: skip
        for t, level in rest:
            b.gap(t, level)
        b.checkpoint([t for t, _ in rest] + (g[INSUFFICIENT] if not upcoming else []), "Kiểm tra các chủ đề còn lại")
    else:  # intensive_review
        for t, level in weak:
            b.gap(t, level)
        for lesson in curriculum.lessons:
            others = [t for t in lesson.topics if t in g[SOLID] or t in g[INSUFFICIENT]]
            if lesson.id in covered and others:
                b.refresh(lesson, others)
        gate = b.checkpoint(curriculum.topics(covered), "Kiểm tra tổng toàn bộ phạm vi đã học")
        if upcoming:
            b.learn(upcoming[0], requires=gate)
            b.checkpoint(list(upcoming[0].topics), f"Kiểm tra bài {upcoming[0].order}: {upcoming[0].title}")

    meta = STRATEGIES[strategy]
    steps = b.steps
    return {
        "strategy": strategy, "title": meta["title"], "description": meta["description"],
        "steps": steps,
        "summary": {
            "steps": len(steps), "total_minutes": sum(s["minutes"] for s in steps),
            "review_topics": len({t for s in steps if s["kind"] in ("review", "reinforce") for t in s["topic_ids"]}),
            "new_lessons": [s["lesson_title"] for s in steps if s["kind"] == "learn"],
            "checkpoints": sum(1 for s in steps if s["kind"] == "checkpoint"),
        },
    }  # fmt: skip


def recommend_strategy(
    curriculum: Curriculum, covered: set[str], mastery: dict[str, dict[str, Any]]
) -> tuple[str, str]:
    """(chiến lược đề xuất, lý do) — quy tắc rõ ràng để người học hiểu vì sao, vẫn được chọn khác."""
    g = _classify(curriculum, covered, mastery)
    assessed = len(g[MISSING]) + len(g[REINFORCE]) + len(g[SOLID])
    weak = len(g[MISSING]) + len(g[REINFORCE])
    upcoming = curriculum.next_lessons(covered)
    if assessed and (len(g[MISSING]) / assessed >= 0.4 or weak / assessed >= 0.6):
        return "intensive_review", f"{weak}/{assessed} chủ đề đã đánh giá còn yếu — nên ôn chắc phạm vi đã học trước."
    blockers = prerequisite_gaps(curriculum, covered, mastery, upcoming[0]) if upcoming else []
    if blockers:
        names = ", ".join(f"“{t.title}”" for t in blockers[:3])
        return "foundation_first", f"Bài kế tiếp “{upcoming[0].title}” cần nền {names} mà bạn chưa vững."
    if g[MISSING]:
        return "foundation_first", f"Còn {len(g[MISSING])} chủ đề thiếu nền tảng cần ôn trước."
    if not upcoming:
        return "intensive_review", "Bạn đã học hết các bài — ôn tổng để chắc kiến thức."
    return "continue_with_gaps", "Phần lớn đã vững — có thể học tiếp và vá lỗ hổng song song."


def path_options(
    curriculum: Curriculum,
    covered: set[str],
    mastery: dict[str, dict[str, Any]],
    refs: dict[str, list[dict[str, Any]]] | None = None,
) -> list[dict[str, Any]]:
    best, why = recommend_strategy(curriculum, covered, mastery)
    out = []
    for key, meta in STRATEGIES.items():
        r = build_roadmap(curriculum, covered, mastery, key, refs)
        out.append({
            "strategy": key, **meta, "recommended": key == best, "rationale": why if key == best else "",
            "summary": r["summary"], "preview": [s["title"] for s in r["steps"][:5]],
        })  # fmt: skip
    out.sort(key=lambda o: not o["recommended"])
    return out
