"""Báo cáo RAGAS + chỉ số nguồn (BL-36) → eval/results/<run_id>_ragas.md.

Chạy:
    python -m eval.ragas.report --run-id <accuracy_run> [--file ragas_<ts>.jsonl]

RAGAS là chẩn đoán, báo tách khỏi accuracy người chấm. Ngưỡng chỉ được coi là tiêu chí khi
thresholds_confirmed=true trong file meta của lần chấm.
"""

from __future__ import annotations

import argparse
import statistics
import sys

from eval.common import (
    EXIT_CONFIG_ERROR,
    EXIT_OK,
    ConfigError,
    iter_jsonl,
    load_config,
    now_iso,
    read_json,
    rel,
    resolve,
    setup_console,
)
from eval.rubric import criterion_pass_counts
from eval.scoring import load_run
from eval.scoring.grade_sheet import final_grades


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Báo cáo RAGAS (BL-36).")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--file", help="tên file ragas_<ts>.jsonl trong thư mục run (mặc định: mới nhất)")
    args = parser.parse_args(argv)
    try:
        config = load_config()
        run = load_run(config, args.run_id)
        files = sorted(run.path.glob("ragas_*.jsonl"))
        if args.file:
            files = [run.path / args.file]
        if not files or not files[-1].is_file():
            raise ConfigError(f"Chưa có kết quả RAGAS — chạy: python -m eval.ragas.run_ragas --run-id {args.run_id}")
        path = files[-1]
        rows = [o for _, o in iter_jsonl(path)]
        meta_path = path.with_suffix(".meta.json")
        meta = read_json(meta_path) if meta_path.is_file() else {}
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    confirmed = bool(meta.get("thresholds_confirmed"))
    thresholds = meta.get("thresholds", {})
    lines = [
        f"# Báo cáo RAGAS — {args.run_id}",
        "",
        f"- Tạo lúc: {now_iso()} · file `{rel(path)}`",
        f"- ragas {meta.get('ragas_version', '?')} · judge `{meta.get('judge_model', '?')}` "
        f"(temperature {meta.get('judge_temperature', '?')}) · embedding `{meta.get('embedding_model', '?')}`",
        f"- Nguồn context: `{meta.get('context_source', '?')}`"
        + (
            " — **xấp xỉ**: chỉ gồm đoạn được trích dẫn, không phải toàn bộ context đã retrieve"
            if meta.get("context_source") == "citation_quotes"
            else ""
        ),
        f"- Dataset `{run.config.dataset_version}` · {len(run.cases)} case · chấm được {meta.get('n_samples', '?')} · "
        f"loại {meta.get('n_excluded', '?')}",
        "- Câu nối tiếp: chỉ đưa câu hỏi cuối vào RAGAS (không kèm lịch sử).",
        "",
        "> RAGAS là chỉ số **chẩn đoán**, không thay accuracy do người chấm (PRD 13.5)."
        + ("" if confirmed else " Ngưỡng dưới đây **chưa được xác nhận** — không dùng để kết luận nghiệm thu."),
        "",
        "## Kết quả",
        "",
        "| Metric | Mean | Median | n có điểm | Lỗi/loại | Ngưỡng"
        + (" (đã xác nhận)" if confirmed else " (đề xuất)")
        + " |",
        "|---|---|---|---|---|---|",
    ]
    for metric in sorted({r["metric"] for r in rows}):
        scores = [r["score"] for r in rows if r["metric"] == metric and r["score"] is not None]
        errors = sum(1 for r in rows if r["metric"] == metric and r["score"] is None)
        mean = f"{statistics.fmean(scores):.3f}" if scores else "—"
        median = f"{statistics.median(scores):.3f}" if scores else "—"
        th = thresholds.get(metric)
        lines.append(f"| {metric} | {mean} | {median} | {len(scores)} | {errors} | {th if th is not None else '—'} |")

    retr_path = run.path / "retrieval_metrics.json"
    lines += ["", "## Chỉ số nguồn từ citation", ""]
    if retr_path.is_file():
        rm = read_json(retr_path)
        n = rm["n_cases"]
        lines += [
            f"- Có citation trúng nguồn được phép: {rm['source_hit']}/{n}",
            f"- Có citation trúng đúng trang/slide tham chiếu: {rm['locator_hit']}/{n}",
            f"- Citation chưa ánh xạ được: {rm['unmapped_citations']}",
            f"- Retrieval recall@k: {rm['recall_at_k_note']}",
        ]
    else:
        lines.append(f"Chưa chạy: python -m eval.ragas.retrieval_metrics --run-id {args.run_id} --fixtures <env>")

    final = final_grades(run)
    lines += ["", "## Citation support/coverage (người chấm, UC-04)", ""]
    if final:
        lines.append(
            f"- Tiêu chí citation đạt: {criterion_pass_counts(final.values())['citation']}/{len(final)} case đã chấm"
        )
    else:
        lines.append("- Chưa có phiếu chấm.")

    errors = [r for r in rows if r["score"] is None]
    lines += ["", "## Lượt lỗi / loại (không bỏ âm thầm)", "", "| Case | Metric | Lý do |", "|---|---|---|"]
    lines += [f"| {r['case_id']} | {r['metric']} | {r['error']} |" for r in errors] or ["| — | — | Không có |"]
    text = "\n".join(lines) + "\n"
    out = resolve(config.results_dir) / f"{args.run_id}_ragas.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(text)
    print(f"Đã ghi {rel(out)}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
