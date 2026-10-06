"""Khung đề (blueprint) của bài đánh giá — hàm thuần, không DB/LLM (D-82).

Nguyên tắc:
- CHỈ chủ đề thuộc các bài đã học (tiến độ). Chủ đề ngoài phạm vi bị loại và báo rõ, không bao giờ hỏi.
- PHỦ RỘNG trước: mỗi chủ đề trong phạm vi ít nhất 1 câu; còn quỹ câu thì hỏi thêm chủ đề chưa rõ/yếu và phủ từng mục
  tiêu, mỗi chủ đề tối đa PER_TOPIC_CAP câu. Không đủ quỹ cho mọi chủ đề → hoãn chủ đề ưu tiên thấp, ghi rõ lý do
  (FR-03.2: "phải đủ để bao phủ các chủ đề được đánh giá hoặc nêu rõ giới hạn").
- Ưu tiên: chưa từng đánh giá > thiếu nền tảng > cần củng cố > chưa đủ dữ liệu > đã vững; cùng mức thì bài trước.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.services.learning_path.curriculum import Curriculum, Topic

PER_TOPIC_CAP = 3
_PRIORITY = {None: 0, "missing_foundation": 1, "needs_reinforcement": 2, "insufficient_data": 3, "solid": 4}


@dataclass
class Slot:
    id: str
    lesson_id: str
    topic_id: str
    objective_id: str


@dataclass
class Blueprint:
    lesson_ids: list[str]
    topic_ids: list[str]
    slots: list[Slot]
    deferred: list[dict[str, str]] = field(default_factory=list)  # chủ đề trong phạm vi nhưng lượt này chưa hỏi
    excluded: list[str] = field(default_factory=list)  # chủ đề được yêu cầu nhưng NGOÀI phạm vi đã học


def _needs_depth(m: dict[str, Any] | None) -> bool:
    return m is None or m.get("level") != "solid" or m.get("confidence") == "low"


def build_blueprint(
    curriculum: Curriculum,
    covered_lesson_ids: list[str] | set[str],
    mastery: dict[str, dict[str, Any]],
    max_questions: int,
    focus_topic_ids: list[str] | None = None,
) -> Blueprint:
    """`mastery`: topic_id → {"level", "confidence"} từ các lần đánh giá trước (rỗng nếu chưa có)."""
    covered = set(covered_lesson_ids)
    in_scope = curriculum.topics(covered)
    excluded: list[str] = []
    if focus_topic_ids is not None:
        scope_ids = {t.id for t in in_scope}
        excluded = [t for t in focus_topic_ids if t not in scope_ids]
        wanted = set(focus_topic_ids)
        in_scope = [t for t in in_scope if t.id in wanted]
    order = {x.id: x.order for x in curriculum.lessons}
    nth = {t.id: i for x in curriculum.lessons for i, t in enumerate(x.topics)}

    def rank(t: Topic) -> tuple[int, int, int]:
        # cùng mức ưu tiên → xoay vòng theo bài (chủ đề thứ i của mọi bài trước chủ đề thứ i+1): quỹ câu nhỏ hơn số
        # chủ đề thì MỌI bài đã học vẫn có câu hỏi, không dồn hết vào các bài đầu (SE101: 75 chủ đề, quỹ 20)
        m = mastery.get(t.id)
        return (_PRIORITY.get(m.get("level") if m else None, 3), nth[t.id], order[t.lesson_id])

    ranked = sorted(in_scope, key=rank)
    chosen, deferred = ranked[:max_questions], ranked[max_questions:]
    targets = {t.id: 1 for t in chosen}
    budget = max_questions - len(chosen)
    # Vòng thêm câu: mỗi vòng cho mỗi chủ đề còn cần thêm 1 câu (chủ đề yếu/chưa rõ → tối đa CAP, phủ từng mục tiêu;
    # chủ đề đã vững chắc → 1 câu đủ nhắc lại). Theo thứ tự ưu tiên để quỹ hết thì chủ đề yếu đã được hỏi sâu.
    while budget > 0:
        progressed = False
        for t in chosen:
            want = PER_TOPIC_CAP if _needs_depth(mastery.get(t.id)) else 1
            want = max(want, min(len(t.objectives), PER_TOPIC_CAP))
            if targets[t.id] < want and budget > 0:
                targets[t.id] += 1
                budget -= 1
                progressed = True
        if not progressed:
            break
    position = {t.id: i for i, t in enumerate(curriculum.topics())}
    slots: list[Slot] = []
    for t in sorted(chosen, key=lambda t: position[t.id]):  # trình bày theo thứ tự đề cương
        for k in range(targets[t.id]):
            obj = t.objectives[k % len(t.objectives)]
            slots.append(Slot(f"s{len(slots) + 1}", t.lesson_id, t.id, obj.id))
    return Blueprint(
        lesson_ids=[x.id for x in curriculum.lessons if x.id in covered],
        topic_ids=[t.id for t in chosen],
        slots=slots,
        deferred=[{"topic_id": t.id, "reason": "quota"} for t in deferred],
        excluded=excluded,
    )
