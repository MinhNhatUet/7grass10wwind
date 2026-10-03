"""Chạy bộ dev/holdout qua API thật và lưu output thô (BL-27; PRD 13.7 bước 4; UAT-17).

Chạy:
    python -m eval.runner.run_accuracy --split dev --fixtures local
    python -m eval.runner.run_accuracy --split holdout --fixtures demo [--known-set-regression]

Không chấm điểm ở đây — chấm bằng eval.scoring.grade_sheet (người chấm) rồi eval.scoring.report.
Holdout phải đã khóa (checksums.json) và khớp sha256, nếu không sẽ từ chối chạy.
"""

from __future__ import annotations

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor

import httpx

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
from eval.runner.client import ApiClient, EndpointMissingError, Fixtures, load_fixtures
from eval.schemas import ApiConfig, RunConfig, RunOutput, TestCase
from eval.validate_dataset import read_checksums, validate


def run_case(case: TestCase, fixtures: Fixtures, api: ApiConfig, base_url: str, timeout_s: float) -> RunOutput:
    """Một case = một phiên mới: đăng nhập → tạo hội thoại theo môn → gửi các lượt user định sẵn → gửi câu hỏi.

    Giới hạn: API chỉ nhận lượt user, nên lượt assistant trong conversation_context không gửi được;
    câu trả lời trung gian do hệ thống tự sinh (ghi rõ trong báo cáo).
    """
    turns_sent = 0
    try:
        with ApiClient(api, base_url, timeout_s) as client:
            login = client.login(fixtures.account(case.permission_fixture))
            if not login.ok:
                return RunOutput(
                    case_id=case.case_id, status="http_error", http_status=login.status_code, body=login.body,
                    error="đăng nhập thất bại",
                )  # fmt: skip
            conv, conv_id = client.create_conversation(fixtures.ref("courses", case.course_id))
            if not conv.ok or not conv_id:
                return RunOutput(
                    case_id=case.case_id, status="http_error", http_status=conv.status_code, body=conv.body,
                    error="không tạo được hội thoại",
                )  # fmt: skip
            for turn in case.conversation_context:
                if turn.role != "user":
                    continue
                prior = client.send_message(conv_id, turn.content)
                turns_sent += 1
                if not prior.ok:
                    return RunOutput(
                        case_id=case.case_id, status="http_error", http_status=prior.status_code, body=prior.body,
                        error=f"lượt ngữ cảnh {turns_sent} lỗi", turns_sent=turns_sent,
                    )  # fmt: skip
            resp = client.send_message(conv_id, case.question)
            turns_sent += 1
    except EndpointMissingError as e:
        return RunOutput(case_id=case.case_id, status="blocked", error=f"API chưa có endpoint {e}")
    except httpx.TimeoutException:
        return RunOutput(case_id=case.case_id, status="timeout", error=f"quá {timeout_s}s", turns_sent=turns_sent)
    except httpx.TransportError as e:
        return RunOutput(case_id=case.case_id, status="network_error", error=str(e), turns_sent=turns_sent)
    except ConfigError as e:
        return RunOutput(case_id=case.case_id, status="blocked", error=str(e))
    return RunOutput(
        case_id=case.case_id,
        status="ok" if resp.ok else "http_error",
        http_status=resp.status_code,
        body=resp.body,
        latency_ms=resp.latency_ms,
        turns_sent=turns_sent,
    )


def preflight(fixtures: Fixtures, account: str, api: ApiConfig, base_url: str, timeout_s: float) -> str | None:
    """Kiểm tra API có sẵn trước khi chạy cả bộ; trả thông báo blocked hoặc None."""
    try:
        with ApiClient(api, base_url, timeout_s) as client:
            client.login(fixtures.account(account))
    except EndpointMissingError as e:
        return f"API chưa có endpoint {e} (BL-05)."
    except httpx.TransportError as e:
        return f"Không kết nối được {base_url}: {e}"
    return None


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Chạy eval accuracy qua API (BL-27).")
    parser.add_argument("--split", choices=["dev", "holdout", "extended"], default="holdout")
    parser.add_argument("--file", help="mặc định: config.datasets[split]")
    parser.add_argument("--fixtures", default="local", help="tên môi trường: data/eval/fixtures/<tên>.json")
    parser.add_argument("--base-url")
    parser.add_argument("--run-id")
    parser.add_argument("--concurrency", type=int)
    parser.add_argument("--timeout", type=float)
    parser.add_argument(
        "--known-set-regression",
        action="store_true",
        help="đánh dấu lần chạy lại sau khi đã sửa dựa trên lỗi holdout (PRD 13.7 bước 7)",
    )
    parser.add_argument("--note", default="")
    args = parser.parse_args(argv)

    try:
        config = load_config()
        manifest = load_manifest(config)
        path = resolve(args.file or config.datasets[args.split])
        if not path.is_file():
            print(f"Chưa có dữ liệu {args.split}: {rel(path)} — không có gì để chạy.")
            return EXIT_CONFIG_ERROR
        loaded, issues = validate(args.split, path, config, manifest)
        errors = [i for i in issues if i.level == "ERROR"]
        if errors:
            print(f"Dataset còn {len(errors)} ERROR — chạy `python -m eval.validate_dataset --split {args.split}`.")
            return EXIT_DATA_ERROR
        cases: list[TestCase] = loaded.cases  # type: ignore[assignment]
        version = cases[0].dataset_version
        sha = sha256_file(path)
        locked_entry = read_checksums(config).get(version)
        locked = bool(locked_entry and locked_entry["sha256"] == sha)
        if args.split == "holdout" and not locked:
            print(f"Holdout '{version}' chưa khóa hoặc đã bị sửa sau khi khóa — từ chối chạy (BR-12).")
            return EXIT_DATA_ERROR
        fixtures = load_fixtures(config.fixtures_dir, args.fixtures)
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    base_url = args.base_url or config.api.base_url
    timeout_s = args.timeout or config.api.timeout_s
    concurrency = args.concurrency or config.api.concurrency

    blocked = preflight(fixtures, cases[0].permission_fixture, config.api, base_url, timeout_s)
    if blocked:
        print(f"BLOCKED: {blocked} Không tạo kết quả.")
        return EXIT_BLOCKED

    run_id = args.run_id or new_run_id(version)
    out_dir = run_dir(config, run_id)
    if out_dir.exists():
        print(f"run_id {run_id} đã tồn tại — chọn run_id khác.", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    run_cfg = RunConfig(
        run_id=run_id,
        kind="accuracy",
        dataset_path=rel(path),
        dataset_version=version,
        dataset_sha256=sha,
        dataset_locked=locked,
        known_set_regression=args.known_set_regression,
        base_url=base_url,
        git_commit=git_commit(),
        config_version=config.config_version,
        concurrency=concurrency,
        timeout_s=timeout_s,
        started_at=now_iso(),
        note=args.note,
    )
    write_json(out_dir / "run_config.json", run_cfg)
    print(f"Run {run_id}: {len(cases)} case, concurrency {concurrency}, timeout {timeout_s}s → {rel(out_dir)}")

    def job(case: TestCase) -> RunOutput:
        return run_case(case, fixtures, config.api, base_url, timeout_s)

    outputs: list[RunOutput] = []
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        for i, out in enumerate(pool.map(job, cases), start=1):
            outputs.append(out)
            write_jsonl(out_dir / "outputs.jsonl", [out], append=True)
            print(f"  [{i}/{len(cases)}] {out.case_id}: {out.status}" + (f" ({out.error})" if out.error else ""))

    run_cfg.finished_at = now_iso()
    write_json(out_dir / "run_config.json", run_cfg)
    counts: dict[str, int] = {}
    for o in outputs:
        counts[o.status] = counts.get(o.status, 0) + 1
    print(f"Xong: {counts}. Tiếp theo: python -m eval.scoring.auto_checks --run-id {run_id}")
    return EXIT_BLOCKED if counts.get("blocked") == len(outputs) else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
