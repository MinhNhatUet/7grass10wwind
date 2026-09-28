"""Kiểm tra bộ dev/holdout/safety và khóa phiên bản (BL-03; PRD 13.2, 13.3, 13.6; BR-12).

Chạy:
    python -m eval.validate_dataset --split holdout
    python -m eval.validate_dataset --split holdout --lock --by "<tên>"

Luật D-01…D-13 xem docs/plans/UC-03. Đường dẫn và ngưỡng mặc định lấy từ eval/config.json.
"""

from __future__ import annotations

import argparse
import re
import string
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Literal

from pydantic import ValidationError

from eval.common import (
    EXIT_CONFIG_ERROR,
    EXIT_DATA_ERROR,
    EXIT_OK,
    ConfigError,
    iter_jsonl,
    load_config,
    load_manifest,
    read_json,
    rel,
    resolve,
    setup_console,
    sha256_file,
    write_json,
)
from eval.schemas import QUESTION_TYPE_LABELS, EvalConfig, Manifest, QuestionType, RouterCase, SafetyCase, TestCase

Split = Literal["dev", "holdout", "safety", "router", "extended"]
SPLITS: tuple[Split, ...] = ("dev", "holdout", "safety", "router", "extended")
# Các cặp split không được có câu trùng/gần trùng (D-06)
NO_OVERLAP_PAIRS = ({"dev", "holdout"}, {"extended", "dev"}, {"extended", "holdout"})


@dataclass
class Issue:
    level: Literal["ERROR", "WARNING"]
    code: str
    message: str
    case_id: str | None = None

    def __str__(self) -> str:
        where = f" [{self.case_id}]" if self.case_id else ""
        return f"{self.level:7} {self.code}{where}: {self.message}"


@dataclass
class LoadedSplit:
    split: Split
    path: Path
    cases: list[TestCase] | list[SafetyCase]
    issues: list[Issue]


def load_split(split: Split, path: Path) -> LoadedSplit:
    """D-01: mỗi dòng parse được theo schema."""
    model = {"safety": SafetyCase, "router": RouterCase}.get(split, TestCase)
    cases: list = []
    issues: list[Issue] = []
    try:
        for lineno, obj in iter_jsonl(path):
            try:
                cases.append(model.model_validate(obj))
            except ValidationError as e:
                errs = "; ".join(f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors())
                issues.append(Issue("ERROR", "D-01", f"dòng {lineno}: {errs}", obj.get("case_id")))
    except ValueError as e:
        issues.append(Issue("ERROR", "D-01", str(e)))
    return LoadedSplit(split, path, cases, issues)


_PUNCT = re.compile(f"[{re.escape(string.punctuation)}“”‘’…]")


def normalize_question(text: str) -> str:
    return " ".join(_PUNCT.sub(" ", text.lower()).split())


def check_common(loaded: LoadedSplit) -> list[Issue]:
    issues: list[Issue] = []
    ids = Counter(c.case_id for c in loaded.cases)
    issues += [Issue("ERROR", "D-02", f"case_id lặp {n} lần trong file", cid) for cid, n in ids.items() if n > 1]
    versions = {c.dataset_version for c in loaded.cases}
    if len(versions) > 1:
        issues.append(Issue("ERROR", "D-13", f"một file chỉ được có một dataset_version, đang có {sorted(versions)}"))
    return issues


def check_testcases(loaded: LoadedSplit, config: EvalConfig, manifest: Manifest) -> list[Issue]:
    cases: list[TestCase] = loaded.cases  # type: ignore[assignment]
    issues: list[Issue] = []
    course_ids = set(manifest.course_names())
    source_versions = manifest.source_versions()
    source_ids = {sid for sid, _ in source_versions}

    for c in cases:
        if c.split != loaded.split:
            issues.append(Issue("ERROR", "D-12", f"split='{c.split}' nằm trong file {loaded.split}", c.case_id))
        if c.course_id not in course_ids:
            issues.append(Issue("ERROR", "D-07", f"course_id '{c.course_id}' không có trong manifest", c.case_id))
        for sv in c.allowed_source_versions:
            if (sv.source_id, sv.version) not in source_versions:
                issues.append(
                    Issue("ERROR", "D-07", f"nguồn {sv.source_id} v{sv.version} không có trong manifest", c.case_id)
                )
        allowed_ids = {sv.source_id for sv in c.allowed_source_versions}
        for loc in c.reference_locators:
            if loc.source_id not in source_ids:
                issues.append(Issue("ERROR", "D-07", f"locator trỏ tới nguồn lạ {loc.source_id}", c.case_id))
            elif loc.source_id not in allowed_ids:
                issues.append(
                    Issue(
                        "ERROR", "D-07", f"locator {loc.source_id} không nằm trong allowed_source_versions", c.case_id
                    )
                )
        if c.question_type == QuestionType.FOLLOW_UP and not c.conversation_context:
            issues.append(Issue("ERROR", "D-08", "câu nối tiếp phải có conversation_context", c.case_id))
        if loaded.split == "holdout":
            if c.expected_behavior != "answered":
                issues.append(
                    Issue(
                        "ERROR",
                        "D-11",
                        f"holdout chỉ gồm câu có nguồn (expected_behavior=answered), đang là '{c.expected_behavior}'",
                        c.case_id,
                    )
                )
        if loaded.split in ("holdout", "extended") and not c.label_reviewer:
            issues.append(Issue("WARNING", "D-09", "chưa có label_reviewer (bắt buộc trước khi lock)", c.case_id))

    if loaded.split == "holdout":
        h = config.holdout
        if len(cases) != h.total:
            issues.append(
                Issue("ERROR", "D-03", f"holdout có {len(cases)} case, cần đúng {h.total} (không dùng bộ nhỏ hơn)")
            )
        per_type = Counter(c.question_type for c in cases)
        for qt in QuestionType:
            if per_type[qt] != h.per_question_type:
                issues.append(
                    Issue(
                        "ERROR",
                        "D-03",
                        f"nhóm '{QUESTION_TYPE_LABELS[qt]}' có {per_type[qt]} case, cần {h.per_question_type}",
                    )
                )
        per_course = Counter(c.course_id for c in cases)
        names = manifest.course_names()
        for cid, expected in h.course_allocation.items():
            if per_course[cid] != expected:
                issues.append(
                    Issue(
                        "ERROR",
                        "D-04",
                        f"môn {cid} ({names.get(cid, '?')}) có {per_course[cid]} case, cần {expected}",
                    )
                )
        extra = set(per_course) - set(h.course_allocation)
        if extra:
            issues.append(Issue("ERROR", "D-04", f"có môn ngoài course_allocation: {sorted(extra)}"))

    if loaded.split == "dev":
        lo, hi = config.dev_size.min, config.dev_size.max
        if not lo <= len(cases) <= hi:
            issues.append(Issue("WARNING", "D-05", f"dev có {len(cases)} case, đề xuất {lo}–{hi}"))
    return issues


def check_safety(loaded: LoadedSplit, config: EvalConfig) -> list[Issue]:
    per_cat = Counter(c.category for c in loaded.cases)  # type: ignore[union-attr]
    issues: list[Issue] = []
    for cat, minimum in config.safety_min_per_category.items():
        if per_cat[cat] < minimum:
            issues.append(Issue("ERROR", "D-10", f"category '{cat}' có {per_cat[cat]} ca, tối thiểu {minimum}"))
    if per_cat["legit_learning"] == 0:
        issues.append(Issue("WARNING", "D-10", "chưa có ca học hợp lệ (legit_learning) để phát hiện chặn quá mức"))
    for c in loaded.cases:
        if not c.label_reviewer:  # type: ignore[union-attr]
            issues.append(Issue("WARNING", "D-09", "chưa có label_reviewer (bắt buộc trước khi lock)", c.case_id))
    return issues


def check_cross_split(loaded: LoadedSplit, others: list[LoadedSplit], ratio: float) -> list[Issue]:
    """D-02 (case_id duy nhất giữa các split) và D-06 (dev × holdout không trùng/gần trùng)."""
    issues: list[Issue] = []
    mine = {c.case_id for c in loaded.cases}
    for other in others:
        for cid in sorted(mine & {c.case_id for c in other.cases}):
            issues.append(Issue("ERROR", "D-02", f"case_id trùng với file {other.split}", cid))
        if {loaded.split, other.split} in NO_OVERLAP_PAIRS:
            other_norm = [(c.case_id, normalize_question(c.question)) for c in other.cases]  # type: ignore[union-attr]
            for c in loaded.cases:
                q = normalize_question(c.question)  # type: ignore[union-attr]
                for oid, oq in other_norm:
                    r = SequenceMatcher(None, q, oq).ratio()
                    if r >= ratio:
                        issues.append(
                            Issue("ERROR", "D-06", f"gần trùng với {other.split} {oid} (độ giống {r:.2f})", c.case_id)
                        )
    return issues


def check_router(loaded: LoadedSplit, manifest: Manifest) -> list[Issue]:
    issues: list[Issue] = []
    course_ids = set(manifest.course_names())
    for c in loaded.cases:
        if c.course_id not in course_ids:  # type: ignore[union-attr]
            issues.append(Issue("ERROR", "D-07", f"course_id '{c.course_id}' không có trong manifest", c.case_id))  # type: ignore[union-attr]
        if not c.label_reviewer:  # type: ignore[union-attr]
            issues.append(Issue("WARNING", "D-09", "chưa có label_reviewer (bắt buộc trước khi lock)", c.case_id))
    return issues


def summarize(loaded: LoadedSplit, manifest: Manifest) -> list[str]:
    lines = [f"File: {rel(loaded.path)} — {len(loaded.cases)} case"]
    if loaded.split == "safety":
        for cat, n in sorted(Counter(c.category for c in loaded.cases).items()):  # type: ignore[union-attr]
            lines.append(f"  {cat}: {n}")
        return lines
    if loaded.split == "router":
        for label, n in sorted(Counter("/".join(c.accepted_assistants) for c in loaded.cases).items()):  # type: ignore[union-attr]
            lines.append(f"  chấp nhận {label}: {n}")
        return lines
    per_type = Counter(c.question_type for c in loaded.cases)  # type: ignore[union-attr]
    for qt in QuestionType:
        lines.append(f"  {QUESTION_TYPE_LABELS[qt]}: {per_type[qt]}")
    names = manifest.course_names()
    for cid, n in sorted(Counter(c.course_id for c in loaded.cases).items()):  # type: ignore[union-attr]
        lines.append(f"  {cid} ({names.get(cid, '?')}): {n}")
    return lines


def checksum_entry(loaded: LoadedSplit, locked_by: str) -> dict:
    entry: dict = {
        "split": loaded.split,
        "file": rel(loaded.path),
        "sha256": sha256_file(loaded.path),
        "n": len(loaded.cases),
        "locked_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "locked_by": locked_by,
    }
    if loaded.split == "router":
        pass
    elif loaded.split == "safety":
        entry["per_category"] = dict(Counter(c.category for c in loaded.cases))  # type: ignore[union-attr]
    else:
        entry["per_question_type"] = {str(k): v for k, v in Counter(c.question_type for c in loaded.cases).items()}  # type: ignore[union-attr]
        entry["per_course"] = dict(Counter(c.course_id for c in loaded.cases))  # type: ignore[union-attr]
    return entry


def read_checksums(config: EvalConfig) -> dict:
    path = resolve(config.checksums_path)
    return read_json(path) if path.is_file() else {}


def check_lock_integrity(loaded: LoadedSplit, config: EvalConfig) -> list[Issue]:
    """Dữ liệu đã khóa không được sửa nội dung dưới cùng dataset_version."""
    versions = {c.dataset_version for c in loaded.cases}
    if len(versions) != 1:
        return []
    entry = read_checksums(config).get(versions.pop())
    if entry and entry["sha256"] != sha256_file(loaded.path):
        return [
            Issue(
                "ERROR",
                "D-14",
                f"dataset_version này đã khóa ngày {entry['locked_at']} nhưng nội dung file đã đổi — tạo version mới",
            )
        ]
    return []


def validate(split: Split, path: Path, config: EvalConfig, manifest: Manifest) -> tuple[LoadedSplit, list[Issue]]:
    loaded = load_split(split, path)
    issues = list(loaded.issues) + check_common(loaded)
    if split == "safety":
        issues += check_safety(loaded, config)
    elif split == "router":
        issues += check_router(loaded, manifest)
    else:
        issues += check_testcases(loaded, config, manifest)
    others = []
    for other in SPLITS:
        other_path = resolve(config.datasets[other])
        if other != split and other_path.is_file():
            others.append(load_split(other, other_path))
    issues += check_cross_split(loaded, others, config.near_duplicate_ratio)
    issues += check_lock_integrity(loaded, config)
    return loaded, issues


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Kiểm tra dev/holdout/safety (BL-03).")
    parser.add_argument("--split", choices=SPLITS, required=True)
    parser.add_argument("--file", help="mặc định: config.datasets[split]")
    parser.add_argument("--manifest", help="mặc định: config.manifest_path")
    parser.add_argument("--lock", action="store_true", help="ghi checksum vào eval/datasets/checksums.json")
    parser.add_argument("--by", help="người khóa (bắt buộc khi --lock)")
    args = parser.parse_args(argv)

    try:
        config = load_config()
        manifest = load_manifest(config, args.manifest)
        path = resolve(args.file or config.datasets[args.split])
        if not path.is_file():
            print(f"Chưa có dữ liệu {args.split}: {rel(path)}")
            print(
                "⇒ Chưa đủ điều kiện chạy nghiệm thu (PRD 13.2). Người gán nhãn cần tạo file theo eval/datasets/README.md."
            )
            return EXIT_CONFIG_ERROR
        loaded, issues = validate(args.split, path, config, manifest)
    except ConfigError as e:
        print(f"Lỗi config: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    if args.lock:
        if not args.by:
            print("--lock cần --by <tên người khóa>", file=sys.stderr)
            return EXIT_CONFIG_ERROR
        issues += [
            Issue("ERROR", "D-09", "phải có label_reviewer trước khi lock", i.case_id)
            for i in issues
            if i.code == "D-09"
        ]

    print("\n".join(summarize(loaded, manifest)))
    errors = [i for i in issues if i.level == "ERROR"]
    warnings = [i for i in issues if i.level == "WARNING"]
    for issue in errors + warnings:
        print(issue)
    print(f"Kết quả: {len(errors)} ERROR, {len(warnings)} WARNING")

    if errors:
        if args.lock:
            print("Không khóa vì còn ERROR.")
        return EXIT_DATA_ERROR

    if args.lock:
        versions = {c.dataset_version for c in loaded.cases}
        version = versions.pop()
        checksums = read_checksums(config)
        if version in checksums:
            print(f"dataset_version '{version}' đã được khóa trước đó — không ghi đè.")
            return EXIT_OK
        checksums[version] = checksum_entry(loaded, args.by)
        out = write_json(config.checksums_path, checksums)
        print(f"Đã khóa {version} → {rel(out)} (sha256 {checksums[version]['sha256'][:12]}…)")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
