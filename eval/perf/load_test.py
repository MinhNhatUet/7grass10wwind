"""Đo latency tìm kiếm (NFR-01) và câu trả lời (NFR-02) qua API thật (BL-30).

Chạy:
    python -m eval.perf.load_test --scenario search --fixtures demo --account student_course_01
    python -m eval.perf.load_test --scenario answer --fixtures demo --account student_course_01

- Truy vấn lấy từ tập DEV (không dùng holdout — BR-12).
- ``--sessions`` phiên đồng thời, mỗi phiên một client đã đăng nhập; tổng ``--requests`` yêu cầu đo.
- ``--warmup`` yêu cầu đầu chạy tuần tự và không tính vào kết quả.
- answer: mỗi yêu cầu tạo hội thoại mới rồi gửi câu hỏi; chỉ đo thời gian gửi câu hỏi → nhận câu trả lời đã kiểm tra.
Output: data/eval/runs/<run_id>/perf.jsonl → python -m eval.perf.perf_report --run-id ID
"""

from __future__ import annotations

import argparse
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from itertools import cycle
from typing import Literal

import httpx
from pydantic import BaseModel

from eval.common import (
    EXIT_BLOCKED,
    EXIT_CONFIG_ERROR,
    EXIT_OK,
    ConfigError,
    git_commit,
    iter_jsonl,
    load_config,
    new_run_id,
    now_iso,
    rel,
    resolve,
    run_dir,
    setup_console,
    write_json,
    write_jsonl,
)
from eval.runner.client import ApiClient, EndpointMissingError, Fixtures, load_fixtures
from eval.schemas import ApiConfig, RunConfig, TestCase

Scenario = Literal["search", "answer"]


class PerfSample(BaseModel):
    index: int
    scenario: Scenario
    warmup: bool
    status: Literal["ok", "http_error", "timeout", "network_error"]
    http_status: int | None = None
    latency_ms: float | None = None
    error: str | None = None


def one_request(
    client: ApiClient, scenario: Scenario, case: TestCase, fixtures: Fixtures, index: int, warmup: bool
) -> PerfSample:
    course = fixtures.ref("courses", case.course_id)
    try:
        if scenario == "search":
            resp = client.search_documents(case.question, course)
        else:
            conv, conv_id = client.create_conversation(course)
            if not conv.ok or not conv_id:
                return PerfSample(
                    index=index, scenario=scenario, warmup=warmup, status="http_error",
                    http_status=conv.status_code, error="không tạo được hội thoại",
                )  # fmt: skip
            resp = client.send_message(conv_id, case.question)
    except httpx.TimeoutException:
        return PerfSample(index=index, scenario=scenario, warmup=warmup, status="timeout", error="timeout")
    except httpx.TransportError as e:
        return PerfSample(index=index, scenario=scenario, warmup=warmup, status="network_error", error=str(e))
    return PerfSample(
        index=index,
        scenario=scenario,
        warmup=warmup,
        status="ok" if resp.ok else "http_error",
        http_status=resp.status_code,
        latency_ms=resp.latency_ms,
    )


def logged_in_client(api: ApiConfig, base_url: str, timeout_s: float, fixtures: Fixtures, account: str) -> ApiClient:
    client = ApiClient(api, base_url, timeout_s)
    resp = client.login(fixtures.account(account))
    if not resp.ok:
        client.close()
        raise ConfigError(f"Đăng nhập '{account}' thất bại (HTTP {resp.status_code})")
    return client


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Đo latency NFR-01/02 (BL-30).")
    parser.add_argument("--scenario", choices=["search", "answer"], required=True)
    parser.add_argument("--fixtures", default="local")
    parser.add_argument("--account", required=True, help="tên tài khoản trong fixtures")
    parser.add_argument("--base-url")
    parser.add_argument("--sessions", type=int)
    parser.add_argument("--requests", type=int)
    parser.add_argument("--warmup", type=int)
    parser.add_argument("--timeout", type=float)
    parser.add_argument("--run-id")
    parser.add_argument("--note", default="", help="vd: môi trường, corpus version, cache bật/tắt")
    args = parser.parse_args(argv)

    try:
        config = load_config()
        dev_path = resolve(config.datasets["dev"])
        if not dev_path.is_file():
            print(f"Chưa có tập dev ({rel(dev_path)}) để lấy truy vấn — không đo.")
            return EXIT_CONFIG_ERROR
        queries = [TestCase.model_validate(o) for _, o in iter_jsonl(dev_path)]
        if not queries:
            print("Tập dev rỗng — không đo.")
            return EXIT_CONFIG_ERROR
        fixtures = load_fixtures(config.fixtures_dir, args.fixtures)
        fixtures.account(args.account)
    except (ConfigError, ValueError) as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    base_url = args.base_url or config.api.base_url
    timeout_s = args.timeout or config.api.timeout_s
    sessions = args.sessions or config.perf.sessions
    n_requests = args.requests or config.perf.requests
    n_warmup = config.perf.warmup if args.warmup is None else args.warmup
    scenario: Scenario = args.scenario

    try:
        warm_client = logged_in_client(config.api, base_url, timeout_s, fixtures, args.account)
    except EndpointMissingError as e:
        print(f"BLOCKED: API chưa có endpoint {e}. Không ghi số liệu.")
        return EXIT_BLOCKED
    except httpx.TransportError as e:
        print(f"BLOCKED: không kết nối được {base_url}: {e}")
        return EXIT_BLOCKED
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    run_id = args.run_id or new_run_id(f"perf-{scenario}")
    out_dir = run_dir(config, run_id)
    if out_dir.exists():
        print(f"run_id {run_id} đã tồn tại.", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    run_cfg = RunConfig(
        run_id=run_id,
        kind="perf",
        dataset_path=rel(dev_path),
        dataset_version=queries[0].dataset_version,
        base_url=base_url,
        git_commit=git_commit(),
        config_version=config.config_version,
        concurrency=sessions,
        timeout_s=timeout_s,
        started_at=now_iso(),
        note=f"scenario={scenario}; requests={n_requests}; warmup={n_warmup}; {args.note}".strip("; "),
    )
    write_json(out_dir / "run_config.json", run_cfg)
    print(f"Run {run_id}: {scenario}, {sessions} phiên, {n_requests} yêu cầu (+{n_warmup} warm-up) → {rel(out_dir)}")

    try:
        query_iter = cycle(queries)
        with warm_client:
            warm = [one_request(warm_client, scenario, next(query_iter), fixtures, i, True) for i in range(n_warmup)]
        write_jsonl(out_dir / "perf.jsonl", warm)

        # Mỗi phiên một client đăng nhập riêng; yêu cầu chia vòng tròn cho các phiên.
        clients = [logged_in_client(config.api, base_url, timeout_s, fixtures, args.account) for _ in range(sessions)]
        locks = [threading.Lock() for _ in clients]
        jobs = [(i, next(query_iter)) for i in range(n_requests)]

        def job(item: tuple[int, TestCase]) -> PerfSample:
            i, case = item
            slot = i % sessions
            with locks[slot]:  # một phiên chỉ có một yêu cầu đang chạy
                return one_request(clients[slot], scenario, case, fixtures, n_warmup + i, False)

        with ThreadPoolExecutor(max_workers=sessions) as pool:
            samples = list(pool.map(job, jobs))
        for c in clients:
            c.close()
    except (ConfigError, EndpointMissingError) as e:
        print(f"Dừng: {e}", file=sys.stderr)
        return EXIT_BLOCKED if isinstance(e, EndpointMissingError) else EXIT_CONFIG_ERROR

    write_jsonl(out_dir / "perf.jsonl", samples, append=True)
    run_cfg.finished_at = now_iso()
    write_json(out_dir / "run_config.json", run_cfg)
    ok = sum(1 for s in samples if s.status == "ok")
    print(f"Xong: {ok}/{len(samples)} ok. Báo cáo: python -m eval.perf.perf_report --run-id {run_id}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
