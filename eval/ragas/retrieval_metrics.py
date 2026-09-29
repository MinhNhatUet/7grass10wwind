"""Chỉ số nguồn tính từ citation của một lần chạy accuracy (BL-36; PRD 13.5) — không cần thư viện ngoài.

Chạy:
    python -m eval.ragas.retrieval_metrics --run-id <accuracy_run> --fixtures demo

- source_hit: có ít nhất một citation trỏ tới nguồn trong allowed_source_versions.
- locator_hit: có citation trúng đúng (nguồn, trang/slide) trong reference_locators.
- Retrieval recall@k cần danh sách chunk đã retrieve — chỉ có khi context_source = trace:... (Q-14);
  với citation_quotes, recall@k được báo "không đo được", không suy ra từ citation.
Case lỗi/không có output vẫn nằm trong mẫu số (tính là không trúng).
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from pydantic import BaseModel

from eval.common import EXIT_CONFIG_ERROR, EXIT_OK, ConfigError, load_config, rel, setup_console, write_json
from eval.ragas import load_ragas_config
from eval.runner.client import Fixtures, load_fixtures
from eval.schemas import RunOutput, TestCase
from eval.scoring import load_run


class CaseRetrieval(BaseModel):
    case_id: str
    output_ok: bool
    citations: int = 0
    unmapped: int = 0
    source_hit: bool = False
    locator_hit: bool = False


def _citations(body: Any) -> list[dict[str, Any]]:
    if isinstance(body, dict) and isinstance(body.get("citations"), list):
        return [c for c in body["citations"] if isinstance(c, dict)]
    return []


def case_retrieval(case: TestCase, out: RunOutput | None, fixtures: Fixtures) -> CaseRetrieval:
    res = CaseRetrieval(case_id=case.case_id, output_ok=bool(out and out.status == "ok"))
    if not res.output_ok:
        return res
    docs = fixtures.reverse("documents")
    versions = fixtures.reverse("versions")
    allowed = {(sv.source_id, sv.version) for sv in case.allowed_source_versions}
    refs = {(loc.source_id, loc.type, loc.value) for loc in case.reference_locators}
    cites = _citations(out.body)  # type: ignore[union-attr]
    res.citations = len(cites)
    for c in cites:
        source_id = docs.get(str(c.get("document_id", "")))
        if source_id is None:
            res.unmapped += 1
            continue
        version = versions.get(str(c.get("version_id", "")), str(c.get("version_id", "")))
        if (source_id, version) in allowed:
            res.source_hit = True
        loc = c.get("locator") if isinstance(c.get("locator"), dict) else {}
        try:
            key = (source_id, loc.get("type"), int(loc.get("value")))
        except (TypeError, ValueError):
            continue
        if key in refs:
            res.locator_hit = True
    return res


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Chỉ số nguồn từ citation (BL-36).")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--fixtures", required=True, help="để ánh xạ document_id/version_id → source_id/version")
    args = parser.parse_args(argv)
    try:
        config = load_config()
        rcfg = load_ragas_config()
        run = load_run(config, args.run_id)
        fixtures = load_fixtures(config.fixtures_dir, args.fixtures)
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    if run.config.kind != "accuracy" or not run.cases:
        print("Cần một lần chạy accuracy có dataset.", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    rows = [case_retrieval(c, run.outputs.get(c.case_id), fixtures) for c in run.cases]
    n = len(rows)
    summary = {
        "run_id": args.run_id,
        "n_cases": n,
        "n_output_ok": sum(r.output_ok for r in rows),
        "source_hit": sum(r.source_hit for r in rows),
        "locator_hit": sum(r.locator_hit for r in rows),
        "unmapped_citations": sum(r.unmapped for r in rows),
        "recall_at_k": None,
        "recall_at_k_note": (
            "không đo được: context_source=citation_quotes không có danh sách chunk đã retrieve (Q-14)"
            if rcfg.context_source == "citation_quotes"
            else f"chưa triển khai cho {rcfg.context_source} — cần chốt định dạng trace với TV2/TV3"
        ),
        "cases": [r.model_dump() for r in rows],
    }
    out = write_json(run.path / "retrieval_metrics.json", summary)
    print(f"{n} case · output ok {summary['n_output_ok']}")
    print(f"source_hit {summary['source_hit']}/{n} · locator_hit {summary['locator_hit']}/{n}")
    if summary["unmapped_citations"]:
        print(f"⚠️ {summary['unmapped_citations']} citation chưa ánh xạ được (bổ sung fixtures refs.documents)")
    print(f"recall@k: {summary['recall_at_k_note']}")
    print(f"Đã ghi {rel(out)}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
