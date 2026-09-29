"""Rubric 4 tiêu chí (PRD 13.4) và luật đạt accuracy (PRD 13.1).

Một câu chỉ đạt khi cả 4 tiêu chí đạt; điểm thành phần chỉ để chẩn đoán.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from eval.schemas import RubricGrade

CRITERIA: dict[str, str] = {
    "knowledge": "Đúng kiến thức",
    "completeness": "Đủ câu trả lời",
    "grounding": "Grounding",
    "citation": "Citation",
}


def is_pass(grade: RubricGrade) -> bool:
    return all(getattr(grade, name) for name in CRITERIA)


@dataclass(frozen=True)
class AccuracyResult:
    passed: int
    total: int
    threshold: int

    @property
    def percent(self) -> float:
        return 100.0 * self.passed / self.total if self.total else 0.0

    @property
    def meets_threshold(self) -> bool:
        # Không làm tròn: 79/100 là không đạt (PRD 13.1).
        return self.passed >= self.threshold


def accuracy(final_grades: dict[str, RubricGrade], case_ids: Iterable[str], threshold: int) -> AccuracyResult:
    """Mẫu số là toàn bộ case của bộ đã khóa; case thiếu phiếu chấm tính là không đạt."""
    ids = list(case_ids)
    passed = sum(1 for cid in ids if cid in final_grades and is_pass(final_grades[cid]))
    return AccuracyResult(passed=passed, total=len(ids), threshold=threshold)


def criterion_pass_counts(grades: Iterable[RubricGrade]) -> dict[str, int]:
    counts = dict.fromkeys(CRITERIA, 0)
    for g in grades:
        for name in CRITERIA:
            counts[name] += int(getattr(g, name))
    return counts
