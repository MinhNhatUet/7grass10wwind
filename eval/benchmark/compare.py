"""So sánh baseline và advanced từ các lần chạy đã có (BL-40).

Chạy:
    python -m eval.benchmark.compare [--baseline eval/benchmark/configs/baseline.json]
                                     [--advanced eval/benchmark/configs/advanced.json]

Không chạy lại hệ thống. Mỗi file cấu hình khai run_id cho từng loại:
    {"label", "git_commit", "corpus_version", "description",
     "runs": {"accuracy", "safety", "perf_search", "perf_answer", "ragas", "router"}}
``ragas`` là tên file ragas_<ts>.jsonl nằm trong thư mục của run accuracy. run_id = null → "chưa chạy".
RAGAS được báo riêng, không thay accuracy.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from eval.common import (
    EXIT_CONFIG_ERROR,
    EXIT_DATA_ERROR,
    EXIT_OK,
    ConfigError,
    iter_jsonl,
    load_config,
    now_iso,
    percentile,
    read_json,
    rel,
    resolve,
    run_dir,
    setup_console,
)
from eval.rubric import accuracy
from eval.schemas import QUESTION_TYPE_LABELS, EvalConfig, QuestionType
from eval.scoring import load_run
from eval.scoring.grade_sheet import final_grades

CONFIG_DIR = Path(__file__).resolve().parent / "configs"
RUN_KINDS = ("accuracy", "safety", "perf_search", "perf_answer", "ragas", "router")


class BenchConfig(BaseModel):
    label: str
    git_commit: str | None = None
    corpus_version: str | None = None
    description: str = ""
    runs: dict[str, str | None] = Field(default_factory=dict)


def _accuracy(config: EvalConfig, run_id: str) -> dict[str, Any]:
    run = load_run(config, run_id)
    final = final_grades(run)
    ids = [c.case_id for c in run.cases]
    acc = accuracy(final, ids, config.holdout.pass_threshold)
    per_type = {}
    for qt in QuestionType:
        qids = [c.case_id for c in run.cases if c.question_type == qt]
        per_type[QUESTION_TYPE_LABELS[qt]] = accuracy(final, qids, 0).passed
    lat = [o.latency_ms for o in run.outputs.values() if o.status == "ok" and o.latency_ms is not None]
    return {
        "passed": acc.passed,
        "total": acc.total,
        "meets": acc.meets_threshold,
        "graded": len(final),
        "per_type": per_type,
        "dataset_version": run.config.dataset_version,
        "known_set_regression": run.config.known_set_regression,
        "answer_p95_in_run": percentile(lat, 95),
    }


def _safety(config: EvalConfig, run_id: str) -> dict[str, Any]:
    path = run_dir(config, run_id) / "safety_results.jsonl"
    rows = [o for _, o in iter_jsonl(path)]
    counts = Counter(r["result"] for r in rows)
    blocking = sum(1 for r in rows if r["result"] == "fail" and r["severity_if_fail"] in ("P0", "P1"))
    return {"counts": dict(counts), "p0p1_fail": blocking, "n": len(rows)}


def _perf(config: EvalConfig, run_id: str) -> dict[str, Any]:
    rows = [o for _, o in iter_jsonl(run_dir(config, run_id) / "perf.jsonl") if not o["warmup"]]
    lat = [r["latency_ms"] for r in rows if r["status"] == "ok" and r["latency_ms"] is not None]
    return {"p50": percentile(lat, 50), "p95": percentile(lat, 95), "n": len(rows), "ok": len(lat)}


def _ragas(config: EvalConfig, acc_run: str | None, filename: str) -> dict[str, Any]:
    if not acc_run:
        raise ConfigError("ragas cần runs.accuracy để biết thư mục chứa file")
    rows = [o for _, o in iter_jsonl(run_dir(config, acc_run) / filename)]
    out: dict[str, Any] = {}
    for metric in sorted({r["metric"] for r in rows}):
        scores = [r["score"] for r in rows if r["metric"] == metric and r.get("score") is not None]
        errors = sum(1 for r in rows if r["metric"] == metric and r.get("score") is None)
        out[metric] = {"mean": sum(scores) / len(scores) if scores else None, "n": len(scores), "errors": errors}
    return out


def _router(config: EvalConfig, run_id: str) -> dict[str, Any]:
    rows = [o for _, o in iter_jsonl(run_dir(config, run_id) / "router_results.jsonl")]
    return {"correct": sum(r["correct"] for r in rows), "n": len(rows)}


def collect(config: EvalConfig, bench: BenchConfig) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for kind in RUN_KINDS:
        rid = bench.runs.get(kind)
        if not rid:
            data[kind] = None
            continue
        try:
            if kind == "accuracy":
                data[kind] = _accuracy(config, rid)
            elif kind == "safety":
                data[kind] = _safety(config, rid)
            elif kind.startswith("perf"):
                data[kind] = _perf(config, rid)
            elif kind == "ragas":
                data[kind] = _ragas(config, bench.runs.get("accuracy"), rid)
            else:
                data[kind] = _router(config, rid)
        except (ConfigError, ValueError, KeyError) as e:
            data[kind] = {"error": str(e)}
    return data


def _fmt(v: Any, unit: str = "") -> str:
    if v is None:
        return "chưa chạy"
    if isinstance(v, float):
        return f"{v:,.0f}{unit}" if unit else f"{v:.3f}"
    return f"{v}{unit}"


def build_report(base: BenchConfig, adv: BenchConfig, b: dict[str, Any], a: dict[str, Any], config: EvalConfig) -> str:
    warnings: list[str] = []
    ba, aa = b.get("accuracy") or {}, a.get("accuracy") or {}
    if ba.get("dataset_version") and aa.get("dataset_version") and ba["dataset_version"] != aa["dataset_version"]:
        warnings.append("Hai cấu hình dùng dataset khác nhau — không so sánh accuracy trực tiếp.")
    if base.corpus_version != adv.corpus_version:
        warnings.append(f"Corpus khác nhau ({base.corpus_version} vs {adv.corpus_version}).")
    if aa.get("known_set_regression"):
        warnings.append(
            "Accuracy advanced là regression trên bộ đã biết (PRD 13.7 bước 7), không phải ước lượng độc lập."
        )
    for side, d in (("baseline", b), ("advanced", a)):
        warnings += [f"{side}.{k}: {v['error']}" for k, v in d.items() if isinstance(v, dict) and "error" in v]

    def acc_cell(d: dict[str, Any]) -> str:
        if not d or "error" in d:
            return "chưa chạy" if not d else "lỗi"
        return f"{d['passed']}/{d['total']} (chấm {d['graded']})"

    def safety_cell(d: dict[str, Any] | None) -> str:
        if not d or "error" in d:
            return "chưa chạy" if not d else "lỗi"
        return f"{d['counts']} · P0/P1 fail {d['p0p1_fail']}"

    def perf_cell(d: dict[str, Any] | None, key: str) -> str:
        if not d or "error" in d:
            return "chưa chạy" if not d else "lỗi"
        return _fmt(d[key], " ms")

    def router_cell(d: dict[str, Any] | None) -> str:
        if not d or "error" in d:
            return "chưa chạy" if not d else "lỗi"
        return f"{d['correct']}/{d['n']}"

    lines = [
        f"# Benchmark nâng cao — {now_iso()}",
        "",
        f"- Baseline: **{base.label}** · git `{base.git_commit}` · corpus `{base.corpus_version}` — {base.description}",
        f"- Advanced: **{adv.label}** · git `{adv.git_commit}` · corpus `{adv.corpus_version}` — {adv.description}",
        "",
        "## Kiểm soát bắt buộc",
        "",
        "| Chỉ số | Baseline | Advanced |",
        "|---|---|---|",
        f"| Accuracy holdout (ngưỡng ≥{config.holdout.pass_threshold}/{config.holdout.total}) "
        f"| {acc_cell(ba)} | {acc_cell(aa)} |",
        f"| Safety | {safety_cell(b.get('safety'))} | {safety_cell(a.get('safety'))} |",
        "",
        "## Chất lượng theo nhóm câu hỏi (số case đạt)",
        "",
        "| Nhóm | Baseline | Advanced |",
        "|---|---|---|",
    ]
    for label in QUESTION_TYPE_LABELS.values():
        lines.append(
            f"| {label} | {ba.get('per_type', {}).get(label, '—')} | {aa.get('per_type', {}).get(label, '—')} |"
        )
    lines += [
        "",
        "## Hiệu năng",
        "",
        "| Chỉ số | Baseline | Advanced |",
        "|---|---|---|",
        f"| Search p50 | {perf_cell(b.get('perf_search'), 'p50')} | {perf_cell(a.get('perf_search'), 'p50')} |",
        f"| Search p95 | {perf_cell(b.get('perf_search'), 'p95')} | {perf_cell(a.get('perf_search'), 'p95')} |",
        f"| Answer p50 | {perf_cell(b.get('perf_answer'), 'p50')} | {perf_cell(a.get('perf_answer'), 'p50')} |",
        f"| Answer p95 | {perf_cell(b.get('perf_answer'), 'p95')} | {perf_cell(a.get('perf_answer'), 'p95')} |",
        f"| Router accuracy | {router_cell(b.get('router'))} | {router_cell(a.get('router'))} |",
        "| Token/chi phí | không có dữ liệu (BL-25) | không có dữ liệu (BL-25) |",
        "| Cache hit/miss | không có dữ liệu (BL-37) | không có dữ liệu (BL-37) |",
        "",
        "## RAGAS (chẩn đoán — không thay accuracy)",
        "",
        "| Metric | Baseline mean (n, lỗi) | Advanced mean (n, lỗi) |",
        "|---|---|---|",
    ]
    rb, ra = b.get("ragas") or {}, a.get("ragas") or {}
    for metric in sorted((set(rb) | set(ra)) - {"error"}):

        def cell(d: dict[str, Any], m: str = metric) -> str:
            v = d.get(m)
            return f"{_fmt(v['mean'])} ({v['n']}, {v['errors']})" if isinstance(v, dict) else "chưa chạy"

        lines.append(f"| {metric} | {cell(rb)} | {cell(ra)} |")
    if not (set(rb) | set(ra)) - {"error"}:
        lines.append("| — | chưa chạy | chưa chạy |")

    safety_a = a.get("safety") or {}
    ok_acc = bool(aa) and "error" not in aa and aa.get("meets") and aa.get("graded") == aa.get("total")
    ok_safety = bool(safety_a) and "error" not in safety_a and safety_a.get("p0p1_fail") == 0
    pending_safety = (
        bool(safety_a)
        and "error" not in safety_a
        and (safety_a["counts"].get("needs_human", 0) + safety_a["counts"].get("blocked", 0) > 0)
    )
    if ok_acc and ok_safety and not pending_safety:
        verdict = (
            "Kiểm soát bắt buộc của advanced đạt. Vẫn cần bằng chứng từng Should trong docs/uat/advanced_acceptance.md."
        )
    else:
        verdict = (
            "**Chưa đạt nâng cao**: accuracy advanced chưa đủ/chưa chấm xong, còn P0/P1, hoặc safety chưa kết luận."
        )
    lines += ["", "## Kết luận", "", verdict, "", "## Cảnh báo", ""]
    lines += [f"- {w}" for w in warnings] or ["- Không có."]
    lines += ["", "## Trade-off (người phân tích điền)", "", "- Chất lượng:", "- Độ trễ:", "- Chi phí:", "- Giới hạn:"]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="So sánh baseline/advanced (BL-40).")
    parser.add_argument("--baseline", default=str(CONFIG_DIR / "baseline.json"))
    parser.add_argument("--advanced", default=str(CONFIG_DIR / "advanced.json"))
    args = parser.parse_args(argv)
    try:
        config = load_config()
        base = BenchConfig.model_validate(read_json(args.baseline))
        adv = BenchConfig.model_validate(read_json(args.advanced))
    except (ConfigError, ValueError) as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    if not any(base.runs.values()) and not any(adv.runs.values()):
        print("Chưa có lần chạy nào trong configs (mọi run_id đều null) — chưa so sánh được.")
        return EXIT_CONFIG_ERROR
    b, a = collect(config, base), collect(config, adv)
    text = build_report(base, adv, b, a, config)
    out = resolve(config.results_dir) / f"benchmark_{now_iso().replace(':', '').replace('+0000', 'Z')}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(text)
    print(f"Đã ghi {rel(out)}")
    return EXIT_OK if "Chưa đạt" not in text else EXIT_DATA_ERROR


if __name__ == "__main__":
    sys.exit(main())
