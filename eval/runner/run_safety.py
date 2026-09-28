"""Chạy safety suite qua API thật (BL-28; PRD 13.6, 14.2, 14.4).

Chạy:
    python -m eval.runner.run_safety --fixtures demo [--file data/eval/safety/safety_v1.jsonl]

Kết quả mỗi case: pass | fail | needs_human | blocked.
- blocked (endpoint chưa có / tài khoản chưa cấu hình) KHÔNG tính là pass.
- needs_human: máy không kết luận được, người xem rồi ghi bug nếu cần.
Output: data/eval/runs/<run_id>/safety_results.jsonl → báo cáo: python -m eval.scoring.report --run-id ID --safety
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

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
from eval.runner.actions import ActionError, StepContext, perform
from eval.runner.assertions import CheckOutcome, evaluate
from eval.runner.client import ApiClient, EndpointMissingError, Fixtures, load_fixtures
from eval.schemas import ApiConfig, RunConfig, SafetyCase
from eval.validate_dataset import read_checksums, validate

CaseResult = Literal["pass", "fail", "needs_human", "blocked"]
BODY_PREVIEW_CHARS = 2000


class StepResult(BaseModel):
    index: int
    action: str
    account: str
    http_status: int | None = None
    latency_ms: float | None = None
    outcome: Literal["done", "blocked", "error"] = "done"
    error: str | None = None
    checks: list[CheckOutcome] = Field(default_factory=list)
    body_preview: str = ""


class SafetyResult(BaseModel):
    case_id: str
    category: str
    severity_if_fail: str
    related_uat: list[str]
    result: CaseResult
    steps: list[StepResult]


def _preview(body: Any) -> str:
    text = body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)
    return text[:BODY_PREVIEW_CHARS]


def case_result(steps: list[StepResult]) -> CaseResult:
    if any(s.outcome in ("blocked", "error") for s in steps):
        return "blocked"
    results = [c.result for s in steps for c in s.checks]
    if "fail" in results:
        return "fail"
    if "needs_human" in results or not results:
        return "needs_human"
    return "pass"


def run_case(case: SafetyCase, fixtures: Fixtures, api: ApiConfig, base_url: str, timeout_s: float) -> SafetyResult:
    clients: dict[str, ApiClient] = {}
    ctx = StepContext(fixtures=fixtures, bodies=[])
    steps: list[StepResult] = []
    try:
        for i, step in enumerate(case.steps, start=1):
            sr = StepResult(index=i, action=step.action, account=step.as_)
            steps.append(sr)
            try:
                if step.as_ not in clients:
                    client = ApiClient(api, base_url, timeout_s)
                    clients[step.as_] = client
                    login = client.login(fixtures.account(step.as_))
                    if not login.ok:
                        sr.outcome, sr.error = "error", f"đăng nhập '{step.as_}' thất bại (HTTP {login.status_code})"
                        break
                resp = perform(clients[step.as_], step.action, step.args, ctx)
            except EndpointMissingError as e:
                sr.outcome, sr.error = "blocked", f"API chưa có endpoint {e}"
                break
            except (ConfigError, ActionError) as e:
                sr.outcome, sr.error = "error", str(e)
                break
            except httpx.TimeoutException:
                sr.outcome, sr.error = "error", f"timeout {timeout_s}s"
                break
            except httpx.TransportError as e:
                sr.outcome, sr.error = "error", f"lỗi mạng: {e}"
                break
            sr.http_status, sr.latency_ms, sr.body_preview = resp.status_code, resp.latency_ms, _preview(resp.body)
            sr.checks = [evaluate(exp, resp, fixtures) for exp in step.expect]
            ctx.bodies.append(resp.body)
    finally:
        for client in clients.values():
            client.close()
    return SafetyResult(
        case_id=case.case_id,
        category=case.category,
        severity_if_fail=case.severity_if_fail,
        related_uat=case.related_uat,
        result=case_result(steps),
        steps=steps,
    )


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Chạy safety suite qua API (BL-28).")
    parser.add_argument("--file", help="mặc định: config.datasets.safety")
    parser.add_argument("--fixtures", default="local")
    parser.add_argument("--base-url")
    parser.add_argument("--run-id")
    parser.add_argument("--timeout", type=float)
    parser.add_argument("--note", default="")
    args = parser.parse_args(argv)

    try:
        config = load_config()
        manifest = load_manifest(config)
        path = resolve(args.file or config.datasets["safety"])
        if not path.is_file():
            print(f"Chưa có safety suite: {rel(path)} — không có gì để chạy.")
            return EXIT_CONFIG_ERROR
        loaded, issues = validate("safety", path, config, manifest)
        # Safety cho phép chạy khi thiếu số lượng tối thiểu (D-10) để regression sớm, nhưng không khi lỗi parse.
        hard = [i for i in issues if i.level == "ERROR" and i.code != "D-10"]
        if hard:
            print(f"Safety suite còn {len(hard)} ERROR — chạy `python -m eval.validate_dataset --split safety`.")
            return EXIT_DATA_ERROR
        undersized = [i for i in issues if i.code == "D-10" and i.level == "ERROR"]
        fixtures = load_fixtures(config.fixtures_dir, args.fixtures)
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    cases: list[SafetyCase] = loaded.cases  # type: ignore[assignment]
    base_url = args.base_url or config.api.base_url
    timeout_s = args.timeout or config.api.timeout_s
    version = cases[0].dataset_version
    sha = sha256_file(path)
    entry = read_checksums(config).get(version)
    note = args.note
    if undersized:
        note = (note + " | " if note else "") + "bộ safety CHƯA đủ số ca tối thiểu PRD 13.6"

    run_id = args.run_id or new_run_id(version)
    out_dir = run_dir(config, run_id)
    if out_dir.exists():
        print(f"run_id {run_id} đã tồn tại.", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    run_cfg = RunConfig(
        run_id=run_id,
        kind="safety",
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
        note=note,
    )
    write_json(out_dir / "run_config.json", run_cfg)
    print(f"Run {run_id}: {len(cases)} ca safety → {rel(out_dir)}")

    counts: dict[str, int] = {}
    for i, case in enumerate(cases, start=1):
        res = run_case(case, fixtures, config.api, base_url, timeout_s)
        write_jsonl(out_dir / "safety_results.jsonl", [res], append=True)
        counts[res.result] = counts.get(res.result, 0) + 1
        err = next((s.error for s in res.steps if s.error), None)
        print(f"  [{i}/{len(cases)}] {case.case_id} ({case.category}): {res.result}" + (f" — {err}" if err else ""))

    run_cfg.finished_at = now_iso()
    write_json(out_dir / "run_config.json", run_cfg)
    print(f"Xong: {counts}. Báo cáo: python -m eval.scoring.report --run-id {run_id} --safety")
    return EXIT_BLOCKED if counts.get("blocked") == len(cases) else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
