"""Phiếu chấm CSV cho người chấm (BL-27; PRD 13.4).

Chạy:
    python -m eval.scoring.grade_sheet export --run-id ID --grader "<tên>" --role primary
    python -m eval.scoring.grade_sheet export --run-id ID --grader "<tên>" --role second [--seed N]
    python -m eval.scoring.grade_sheet export --run-id ID --grader "<GV>" --role resolution
    python -m eval.scoring.grade_sheet import --run-id ID --file PATH

Vai trò:
- primary: chấm toàn bộ case.
- second: chấm độc lập ≥ config.second_grader_ratio mẫu (chọn ngẫu nhiên, seed ghi lại) + toàn bộ ca tranh chấp.
- resolution: GV quyết định các case bất đồng/tranh chấp; ghi đè kết quả cuối.

Case A-01 (timeout/lỗi hệ thống) được điền sẵn 0 cho cả 4 tiêu chí vì PRD 13.1 tính là không đạt.
Cột tiêu chí: 1 = đạt, 0 = không đạt; tiêu chí 0 bắt buộc ghi lý do.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
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
    read_json,
    rel,
    resolve,
    setup_console,
    write_json,
    write_jsonl,
)
from eval.rubric import CRITERIA, is_pass
from eval.schemas import EvalConfig, RubricGrade
from eval.scoring import LoadedRun, load_run
from eval.scoring.auto_checks import AutoCheck

Role = Literal["primary", "second", "resolution"]
ROLES: tuple[Role, ...] = ("primary", "second", "resolution")

INFO_COLUMNS = ["case_id", "question_type", "course_id", "question", "answer", "citations", "auto_flags"]
GRADE_COLUMNS = [col for name in CRITERIA for col in (name, f"{name}_reason")] + ["disputed", "failure_cause"]
META_COLUMNS = ["run_id", "grader", "role"]
COLUMNS = INFO_COLUMNS + GRADE_COLUMNS + META_COLUMNS


def load_auto_checks(run: LoadedRun) -> dict[str, AutoCheck]:
    path = run.path / "auto_checks.jsonl"
    if not path.is_file():
        raise ConfigError(f"Chưa có auto_checks — chạy: python -m eval.scoring.auto_checks --run-id {run.run_id}")
    return {o["case_id"]: AutoCheck.model_validate(o) for _, o in iter_jsonl(path)}


def load_grades(run: LoadedRun, role: Role) -> dict[str, RubricGrade]:
    """Gộp mọi file grades/<role>_*.jsonl (nếu một case bị chấm nhiều lần, lần import sau thắng)."""
    grades: dict[str, RubricGrade] = {}
    for path in sorted((run.path / "grades").glob(f"{role}_*.jsonl")):
        for _, obj in iter_jsonl(path):
            g = RubricGrade.model_validate(obj)
            grades[g.case_id] = g
    return grades


def disagreements(primary: dict[str, RubricGrade], second: dict[str, RubricGrade]) -> list[str]:
    """Case mà hai người chấm khác nhau ở ít nhất một tiêu chí, hoặc bị đánh dấu tranh chấp."""
    out = []
    for cid, s in second.items():
        p = primary.get(cid)
        if p is None:
            continue
        if any(getattr(p, c) != getattr(s, c) for c in CRITERIA) or p.disputed or s.disputed:
            out.append(cid)
    out += [cid for cid, p in primary.items() if p.disputed and cid not in second]
    return sorted(set(out))


def final_grades(run: LoadedRun) -> dict[str, RubricGrade]:
    """Kết quả cuối = phiếu primary, ghi đè bằng quyết định resolution của GV."""
    grades = load_grades(run, "primary")
    grades.update(load_grades(run, "resolution"))
    return grades


def _answer_text(body: object) -> tuple[str, str]:
    if not isinstance(body, dict):
        return (str(body) if body is not None else ""), ""
    cites = body.get("citations") or []
    return str(body.get("content", "")), json.dumps(cites, ensure_ascii=False)


def select_case_ids(run: LoadedRun, config: EvalConfig, role: Role, seed: int | None) -> tuple[list[str], dict]:
    all_ids = [c.case_id for c in run.cases]
    if role == "primary":
        return all_ids, {}
    primary = load_grades(run, "primary")
    if role == "second":
        sample_file = run.path / "second_sample.json"
        if sample_file.is_file():
            meta = read_json(sample_file)
        else:
            seed = seed if seed is not None else random.SystemRandom().randrange(1_000_000)
            k = -(-len(all_ids) * int(config.second_grader_ratio * 100) // 100)  # ceil
            meta = {
                "seed": seed,
                "ratio": config.second_grader_ratio,
                "sample": sorted(random.Random(seed).sample(all_ids, k)),
            }
            write_json(sample_file, meta)
        disputed = [cid for cid, g in primary.items() if g.disputed]
        return sorted(set(meta["sample"]) | set(disputed)), meta
    ids = disagreements(primary, load_grades(run, "second"))
    return ids, {}


def export(run: LoadedRun, config: EvalConfig, grader: str, role: Role, seed: int | None) -> Path:
    autos = load_auto_checks(run)
    ids, meta = select_case_ids(run, config, role, seed)
    if not ids:
        raise ConfigError(f"Không có case nào cho vai trò {role}.")
    cases = run.case_map
    safe = re.sub(r"[^\w.-]+", "_", grader)
    path = run.path / "grades" / f"{role}_{safe}.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig để Excel đọc đúng tiếng Việt
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        for cid in ids:
            case = cases[cid]
            out = run.outputs.get(cid)
            answer, cites = _answer_text(out.body if out else None)
            auto = autos.get(cid)
            row = {
                "case_id": cid,
                "question_type": case.question_type.value,
                "course_id": case.course_id,
                "question": case.question,
                "answer": answer,
                "citations": cites,
                "auto_flags": " | ".join(auto.flags) if auto else "",
                "run_id": run.run_id,
                "grader": grader,
                "role": role,
            }
            if auto and auto.auto_fail:
                for name in CRITERIA:
                    row[name] = "0"
                    row[f"{name}_reason"] = "A-01: " + (auto.flags[0] if auto.flags else "lỗi hệ thống")
            writer.writerow(row)
    if meta:
        print(f"Mẫu người chấm thứ hai: {len(meta['sample'])} case (seed {meta['seed']}, tỷ lệ {meta['ratio']}).")
    return path


def _parse_bool(value: str, column: str, case_id: str) -> bool:
    v = (value or "").strip().lower()
    if v in {"1", "true", "đạt", "x", "yes"}:
        return True
    if v in {"0", "false", "không", "no"}:
        return False
    raise ValueError(f"{case_id}: cột '{column}' chưa chấm hoặc giá trị '{value}' không hợp lệ (dùng 1/0)")


def import_sheet(run: LoadedRun, file: Path) -> tuple[Path, int]:
    grades: list[RubricGrade] = []
    errors: list[str] = []
    roles, graders = set(), set()
    with file.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            cid = row.get("case_id", "")
            if cid not in run.case_map:
                errors.append(f"case_id '{cid}' không thuộc lần chạy {run.run_id}")
                continue
            if row.get("run_id") != run.run_id:
                errors.append(f"{cid}: run_id trong phiếu '{row.get('run_id')}' khác {run.run_id}")
                continue
            try:
                data = {name: _parse_bool(row.get(name, ""), name, cid) for name in CRITERIA}
                data |= {f"{n}_reason": row.get(f"{n}_reason", "") or "" for n in CRITERIA}
                data["disputed"] = (row.get("disputed") or "").strip().lower() in {"1", "true", "x", "yes"}
                data["failure_cause"] = (row.get("failure_cause") or "").strip() or None
                grades.append(RubricGrade(case_id=cid, run_id=run.run_id, grader=row.get("grader", ""), **data))
                roles.add(row.get("role"))
                graders.add(row.get("grader"))
            except (ValueError, ValidationError) as e:
                errors.append(f"{cid}: {e}")
    if errors:
        raise ValueError("\n".join(errors))
    if len(roles) != 1 or next(iter(roles)) not in ROLES or len(graders) != 1:
        raise ValueError(
            f"Một phiếu chỉ được có một role hợp lệ và một grader (đang có role={roles}, grader={graders})"
        )
    role, grader = roles.pop(), re.sub(r"[^\w.-]+", "_", graders.pop())
    out = write_jsonl(run.path / "grades" / f"{role}_{grader}.jsonl", grades)
    return out, sum(is_pass(g) for g in grades)


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Xuất/nhập phiếu chấm (BL-27).")
    sub = parser.add_subparsers(dest="cmd", required=True)
    ex = sub.add_parser("export")
    ex.add_argument("--run-id", required=True)
    ex.add_argument("--grader", required=True)
    ex.add_argument("--role", choices=ROLES, default="primary")
    ex.add_argument("--seed", type=int, help="seed chọn mẫu người chấm thứ hai (mặc định ngẫu nhiên, được ghi lại)")
    im = sub.add_parser("import")
    im.add_argument("--run-id", required=True)
    im.add_argument("--file", required=True)
    args = parser.parse_args(argv)

    try:
        config = load_config()
        run = load_run(config, args.run_id)
        if args.cmd == "export":
            path = export(run, config, args.grader, args.role, args.seed)
            print(f"Đã xuất phiếu chấm: {rel(path)} — điền 1/0 và lý do, rồi chạy lệnh import.")
        else:
            out, n_pass = import_sheet(run, resolve(args.file))
            print(f"Đã nhập {rel(out)} ({n_pass} case đạt cả 4 tiêu chí trong phiếu này).")
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    except ValueError as e:
        print(f"Phiếu chấm chưa hợp lệ:\n{e}", file=sys.stderr)
        return EXIT_DATA_ERROR
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
