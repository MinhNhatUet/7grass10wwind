"""Báo cáo p50/p95/max, timeout, lỗi của một lần đo (BL-30; NFR-01/02).

Chạy:
    python -m eval.perf.perf_report --run-id ID

Ngưỡng trong config (perf.proposed_thresholds_ms) là ĐỀ XUẤT pilot, chưa xác nhận (PRD 12.1) —
báo cáo chỉ đối chiếu, không kết luận đạt/không đạt chính thức.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter

from eval.common import (
    EXIT_CONFIG_ERROR,
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
from eval.perf.load_test import PerfSample
from eval.schemas import RunConfig


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Báo cáo hiệu năng.")
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args(argv)
    try:
        config = load_config()
        path = run_dir(config, args.run_id)
        run_cfg = RunConfig.model_validate(read_json(path / "run_config.json"))
        samples = [PerfSample.model_validate(o) for _, o in iter_jsonl(path / "perf.jsonl")]
    except (ConfigError, ValueError) as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    measured = [s for s in samples if not s.warmup]
    if not measured:
        print("Không có mẫu đo (ngoài warm-up).", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    scenario = measured[0].scenario
    lat = [s.latency_ms for s in measured if s.status == "ok" and s.latency_ms is not None]
    statuses = Counter(s.status for s in measured)
    p50, p95 = percentile(lat, 50), percentile(lat, 95)
    thresholds = config.perf.proposed_thresholds_ms
    target = thresholds.search_p95 if scenario == "search" else thresholds.answer_p95
    nfr = "NFR-01 (tìm kiếm)" if scenario == "search" else "NFR-02 (câu trả lời hoàn tất)"

    def ms(v: float | None) -> str:
        return f"{v:,.0f} ms" if v is not None else "—"

    lines = [
        f"# Báo cáo hiệu năng — {args.run_id}",
        "",
        f"- Tạo lúc: {now_iso()}",
        f"- Kịch bản: {scenario} · {nfr}",
        f"- Hệ thống: {run_cfg.base_url} · git `{run_cfg.git_commit}` · {run_cfg.concurrency} phiên đồng thời",
        f"- Truy vấn: tập dev `{run_cfg.dataset_path}` ({run_cfg.dataset_version})",
        f"- Ghi chú (môi trường/corpus/cache): {run_cfg.note or 'không có'}",
        f"- Thời gian: {run_cfg.started_at} → {run_cfg.finished_at or 'chưa xong'}",
        "",
        "| Chỉ số | Giá trị |",
        "|---|---|",
        f"| Số yêu cầu đo (không tính warm-up) | {len(measured)} |",
        f"| Trạng thái | {dict(statuses)} |",
        f"| p50 | {ms(p50)} |",
        f"| p95 | {ms(p95)} |",
        f"| max | {ms(max(lat) if lat else None)} |",
        f"| Ngưỡng p95 **đề xuất, chưa xác nhận** | {ms(target)} |",
        "",
        "Latency đo phía client, chỉ tính yêu cầu ok; timeout/lỗi được đếm riêng ở dòng trạng thái.",
    ]
    if p95 is not None:
        cmp = "≤" if p95 <= target else ">"
        lines.append(
            f"Đối chiếu: p95 {ms(p95)} {cmp} {ms(target)} (ngưỡng chưa được chốt — không phải kết luận nghiệm thu)."
        )
    text = "\n".join(lines) + "\n"
    out = resolve(config.results_dir) / f"{args.run_id}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(text)
    print(f"Đã ghi {rel(out)}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
