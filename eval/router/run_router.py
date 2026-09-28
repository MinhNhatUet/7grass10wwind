"""Router accuracy: trợ lý được chọn (trường ``assistant`` PRD 11.3) có thuộc nhãn chấp nhận không (PRD 13.5).

Chạy:
    python -m eval.router.run_router --fixtures demo [--file data/eval/router/router_v1.jsonl]

Output: data/eval/runs/<run_id>/router_results.jsonl và eval/results/<run_id>_router.md.
Case lỗi/blocked vẫn nằm trong mẫu số (tính là sai), không bị loại.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter

from pydantic import BaseModel

from eval.common import (
    EXIT_BLOCKED,
    EXIT_CONFIG_ERROR,
    EXIT_DATA_ERROR,
    EXIT_OK,
    ConfigError,
    git_commit,
    load_config,
    load_manifest,
    new_run_id,
    now_iso,
    rel,
    resolve,
    run_dir,
    setup_console,
    sha256_file,
    write_json,
    write_jsonl,
)
from eval.runner.client import load_fixtures
from eval.runner.run_accuracy import preflight, run_case
from eval.schemas import RouterCase, RunConfig
from eval.validate_dataset import read_checksums, validate


class RouterResult(BaseModel):
    case_id: str
    accepted: list[str]
    chosen: str | None
    correct: bool
    output_status: str
    error: str | None = None
    latency_ms: float | None = None


def build_report(run_cfg: RunConfig, results: list[RouterResult]) -> str:
    n = len(results)
    correct = sum(r.correct for r in results)
    lines = [
        f"# Báo cáo router — {run_cfg.run_id}",
        "",
        f"- Tạo lúc: {now_iso()}",
        f"- Dataset: `{run_cfg.dataset_path}` · version `{run_cfg.dataset_version}` · "
        f"{'đã khóa' if run_cfg.dataset_locked else '**CHƯA khóa**'}",
        f"- Hệ thống: {run_cfg.base_url} · git `{run_cfg.git_commit}`",
        "",
        f"**Router accuracy: {correct}/{n}" + (f" ({100 * correct / n:.1f}%)**" if n else "**"),
        "",
        "Case lỗi/blocked tính là sai. Không có ngưỡng router trong PRD — chỉ báo số liệu.",
        "",
        "## Theo nhãn chấp nhận",
        "",
        "| Nhãn chấp nhận | Đúng | Tổng |",
        "|---|---|---|",
    ]
    groups: dict[str, list[RouterResult]] = {}
    for r in results:
        groups.setdefault("/".join(r.accepted), []).append(r)
    for label, rs in sorted(groups.items()):
        lines.append(f"| {label} | {sum(r.correct for r in rs)} | {len(rs)} |")
    confusion = Counter(("/".join(r.accepted), r.chosen or f"({r.output_status})") for r in results if not r.correct)
    lines += ["", "## Chọn sai", "", "| Nhãn chấp nhận | Hệ thống chọn | Số case |", "|---|---|---|"]
    lines += [f"| {a} | {b} | {k} |" for (a, b), k in confusion.most_common()] or ["| — | — | 0 |"]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Router accuracy (BL-36).")
    parser.add_argument("--file", help="mặc định: config.datasets.router")
    parser.add_argument("--fixtures", default="local")
    parser.add_argument("--base-url")
    parser.add_argument("--run-id")
    parser.add_argument("--timeout", type=float)
    args = parser.parse_args(argv)

    try:
        config = load_config()
        manifest = load_manifest(config)
        path = resolve(args.file or config.datasets["router"])
        if not path.is_file():
            print(f"Chưa có tập router: {rel(path)} — không có gì để chạy.")
            return EXIT_CONFIG_ERROR
        loaded, issues = validate("router", path, config, manifest)
        errors = [i for i in issues if i.level == "ERROR"]
        if errors:
            print(f"Tập router còn {len(errors)} ERROR — chạy `python -m eval.validate_dataset --split router`.")
            return EXIT_DATA_ERROR
        fixtures = load_fixtures(config.fixtures_dir, args.fixtures)
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    cases: list[RouterCase] = loaded.cases  # type: ignore[assignment]
    base_url = args.base_url or config.api.base_url
    timeout_s = args.timeout or config.api.timeout_s
    blocked = preflight(fixtures, cases[0].permission_fixture, config.api, base_url, timeout_s)
    if blocked:
        print(f"BLOCKED: {blocked} Không tạo kết quả.")
        return EXIT_BLOCKED

    version = cases[0].dataset_version
    sha = sha256_file(path)
    entry = read_checksums(config).get(version)
    run_id = args.run_id or new_run_id(version)
    out_dir = run_dir(config, run_id)
    if out_dir.exists():
        print(f"run_id {run_id} đã tồn tại.", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    run_cfg = RunConfig(
        run_id=run_id,
        kind="router",
        dataset_path=rel(path),
        dataset_version=version,
        dataset_sha256=sha,
        dataset_locked=bool(entry and entry["sha256"] == sha),
        base_url=base_url,
        git_commit=git_commit(),
        config_version=config.config_version,
        concurrency=1,
        timeout_s=timeout_s,
        started_at=now_iso(),
    )
    write_json(out_dir / "run_config.json", run_cfg)

    results: list[RouterResult] = []
    for i, case in enumerate(cases, start=1):
        out = run_case(case, fixtures, config.api, base_url, timeout_s)  # type: ignore[arg-type]
        chosen = out.body.get("assistant") if out.status == "ok" and isinstance(out.body, dict) else None
        res = RouterResult(
            case_id=case.case_id,
            accepted=list(case.accepted_assistants),
            chosen=chosen,
            correct=chosen in case.accepted_assistants,
            output_status=out.status,
            error=out.error,
            latency_ms=out.latency_ms,
        )
        results.append(res)
        write_jsonl(out_dir / "router_results.jsonl", [res], append=True)
        print(f"  [{i}/{len(cases)}] {case.case_id}: {chosen or out.status} → {'đúng' if res.correct else 'sai'}")

    run_cfg.finished_at = now_iso()
    write_json(out_dir / "run_config.json", run_cfg)
    report = resolve(config.results_dir) / f"{run_id}_router.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(build_report(run_cfg, results), encoding="utf-8")
    print(f"Router accuracy {sum(r.correct for r in results)}/{len(results)}. Báo cáo: {rel(report)}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
