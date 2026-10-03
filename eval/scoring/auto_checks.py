"""Kiểm tra tự động A-01…A-04 trên output một lần chạy (BL-27). Chỉ gắn cờ, KHÔNG thay người chấm.

Chạy:
    python -m eval.scoring.auto_checks --run-id <run_id> [--fixtures local]

A-01 lỗi HTTP/timeout/lỗi mạng/blocked → case không đạt (PRD 13.1).
A-02 status khác answered/partial với câu có nguồn → nghi từ chối sai.
A-03 không có citation → nghi fail tiêu chí citation.
A-04 citation trỏ tới nguồn ngoài allowed_source_versions → nghi fail; không ánh xạ được ID → cần người xem.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from pydantic import BaseModel, Field

from eval.common import EXIT_CONFIG_ERROR, EXIT_OK, ConfigError, load_config, rel, setup_console, write_jsonl
from eval.runner.client import Fixtures, load_fixtures
from eval.schemas import RunOutput, TestCase
from eval.scoring import load_run

ANSWER_STATUSES = {"answered", "partial"}


class AutoCheck(BaseModel):
    case_id: str
    auto_fail: bool = False
    flags: list[str] = Field(default_factory=list)
    business_status: str | None = None
    citation_count: int = 0


def _citations(body: Any) -> list[dict[str, Any]]:
    if isinstance(body, dict) and isinstance(body.get("citations"), list):
        return [c for c in body["citations"] if isinstance(c, dict)]
    return []


def check_case(case: TestCase, out: RunOutput | None, fixtures: Fixtures | None) -> AutoCheck:
    result = AutoCheck(case_id=case.case_id)
    if out is None:
        result.auto_fail = True
        result.flags.append("A-01: không có output (case chưa chạy)")
        return result
    if out.status != "ok":
        result.auto_fail = True
        result.flags.append(f"A-01: {out.status} {out.http_status or ''} {out.error or ''}".strip())
        return result

    body = out.body if isinstance(out.body, dict) else {}
    result.business_status = body.get("status")
    if result.business_status not in ANSWER_STATUSES:
        result.flags.append(f"A-02: status '{result.business_status}' — nghi từ chối sai với câu có nguồn")

    cites = _citations(out.body)
    result.citation_count = len(cites)
    if not cites:
        result.flags.append("A-03: không có citation")
        return result

    allowed = {(sv.source_id, sv.version) for sv in case.allowed_source_versions}
    docs = fixtures.reverse("documents") if fixtures else {}
    versions = fixtures.reverse("versions") if fixtures else {}
    for c in cites:
        doc_id, ver_id = str(c.get("document_id", "")), str(c.get("version_id", ""))
        source_id = docs.get(doc_id)
        version = versions.get(ver_id, ver_id)
        if source_id is None:
            result.flags.append(f"A-04: chưa ánh xạ document_id '{doc_id}' → source_id (fixtures refs.documents)")
        elif (source_id, version) not in allowed:
            result.flags.append(f"A-04: citation [{c.get('id')}] trỏ tới {source_id} v{version} ngoài nguồn cho phép")
    return result


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Kiểm tra tự động output (A-01…A-04).")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--fixtures", help="tên môi trường để ánh xạ document_id → source_id")
    args = parser.parse_args(argv)
    try:
        config = load_config()
        run = load_run(config, args.run_id)
        fixtures = load_fixtures(config.fixtures_dir, args.fixtures) if args.fixtures else None
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    if not run.cases:
        print("Không đọc được dataset của lần chạy.", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    checks = [check_case(c, run.outputs.get(c.case_id), fixtures) for c in run.cases]
    out = write_jsonl(run.path / "auto_checks.jsonl", checks)
    n_fail = sum(c.auto_fail for c in checks)
    n_flag = sum(1 for c in checks if c.flags and not c.auto_fail)
    print(f"{len(checks)} case: {n_fail} không đạt tự động (A-01), {n_flag} có cờ cần người chấm xem.")
    print(
        f"Đã ghi {rel(out)}. Tiếp theo: python -m eval.scoring.grade_sheet export --run-id {args.run_id} --grader <tên>"
    )
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
