"""Báo cáo accuracy (BL-27, PRD 13.8) và safety (BL-28, PRD 14.4) ra eval/results/<run_id>.md.

Chạy:
    python -m eval.scoring.report --run-id ID            # accuracy
    python -m eval.scoring.report --run-id ID --safety   # safety

Báo cáo chỉ chứa số liệu và case_id — không chứa câu hỏi/đáp án holdout (BR-12).
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from eval.common import (
    EXIT_CONFIG_ERROR,
    EXIT_DATA_ERROR,
    EXIT_OK,
    ConfigError,
    iter_jsonl,
    load_config,
    load_manifest,
    now_iso,
    percentile,
    rel,
    resolve,
    setup_console,
)
from eval.rubric import CRITERIA, accuracy, criterion_pass_counts, is_pass
from eval.schemas import QUESTION_TYPE_LABELS, EvalConfig, Manifest, QuestionType
from eval.scoring import LoadedRun, load_run
from eval.scoring.grade_sheet import disagreements, final_grades, load_grades

BLOCKING_SEVERITIES = {"P0", "P1"}


def _ms(v: float | None) -> str:
    return f"{v:,.0f} ms" if v is not None else "không có dữ liệu"


def _run_header(run: LoadedRun, title: str) -> list[str]:
    c = run.config
    lines = [
        f"# {title} — {run.run_id}",
        "",
        f"- Tạo lúc: {now_iso()}",
        f"- Dataset: `{c.dataset_path}` · version `{c.dataset_version}` · sha256 `{(c.dataset_sha256 or '')[:12]}…` · "
        f"{'đã khóa' if c.dataset_locked else '**CHƯA khóa**'}",
        f"- Hệ thống: {c.base_url} · git `{c.git_commit}` · config `{c.config_version}`",
        f"- Concurrency {c.concurrency} · timeout {c.timeout_s}s · cache câu trả lời: {c.answer_cache}",
        f"- Thời gian chạy: {c.started_at} → {c.finished_at or 'chưa xong'}",
    ]
    if c.known_set_regression:
        lines.append(
            "- ⚠️ **Regression trên bộ đã biết**: đã sửa dựa trên lỗi holdout trước đó — "
            "không phải ước lượng độc lập (PRD 13.7 bước 7)."
        )
    if c.note:
        lines.append(f"- Ghi chú: {c.note}")
    return lines + [""]


def accuracy_report(run: LoadedRun, config: EvalConfig, manifest: Manifest) -> tuple[str, bool]:
    """Trả (markdown, hoàn tất?). Chưa có phiếu primary → không tính accuracy."""
    lines = _run_header(run, "Báo cáo accuracy")
    primary = load_grades(run, "primary")
    if not primary:
        lines += ["**Chưa chấm** — chưa có phiếu primary. Không tính accuracy."]
        return "\n".join(lines) + "\n", False

    final = final_grades(run)
    case_ids = [c.case_id for c in run.cases]
    is_holdout = run.cases and run.cases[0].split == "holdout"
    threshold = config.holdout.pass_threshold
    acc = accuracy(final, case_ids, threshold)
    ungraded = [cid for cid in case_ids if cid not in final]
    second = load_grades(run, "second")
    disputes = disagreements(primary, second)
    unresolved = [cid for cid in disputes if cid not in load_grades(run, "resolution")]
    complete = not ungraded and not unresolved

    if is_holdout:
        verdict = "ĐẠT" if acc.meets_threshold else "KHÔNG ĐẠT"
        if not complete:
            verdict += " (tạm thời — chưa chấm xong)"
        headline = f"**{acc.passed}/{acc.total} đạt cả 4 tiêu chí ({acc.percent:.1f}%) — ngưỡng {threshold}/{config.holdout.total} → {verdict}**"
    else:
        headline = (
            f"**{acc.passed}/{acc.total} đạt cả 4 tiêu chí ({acc.percent:.1f}%)** — tập dev, chỉ để tinh chỉnh, "
            "không phải kết quả nghiệm thu"
        )
    lines += [
        "## Kết quả",
        "",
        headline,
        "",
        "Không làm tròn; timeout, lỗi hệ thống, từ chối sai, citation sai tính là không đạt (PRD 13.1). "
        "Case chưa chấm tính là không đạt.",
        "",
        "## Theo nhóm câu hỏi",
        "",
        "| Nhóm | Đạt | Tổng |",
        "|---|---|---|",
    ]
    cases = run.case_map
    for qt in QuestionType:
        ids = [cid for cid in case_ids if cases[cid].question_type == qt]
        n = sum(1 for cid in ids if cid in final and is_pass(final[cid]))
        lines.append(f"| {QUESTION_TYPE_LABELS[qt]} | {n} | {len(ids)} |")
    lines += ["", "## Theo môn", "", "| Môn | Tên | Đạt | Tổng |", "|---|---|---|---|"]
    names = manifest.course_names()
    for cid_course, n_total in sorted(Counter(c.course_id for c in run.cases).items()):
        ids = [cid for cid in case_ids if cases[cid].course_id == cid_course]
        n = sum(1 for cid in ids if cid in final and is_pass(final[cid]))
        lines.append(f"| {cid_course} | {names.get(cid_course, '?')} | {n} | {n_total} |")

    crit = criterion_pass_counts(final.values())
    lines += ["", "## Theo tiêu chí (chẩn đoán)", "", "| Tiêu chí | Đạt | Đã chấm |", "|---|---|---|"]
    lines += [f"| {label} | {crit[name]} | {len(final)} |" for name, label in CRITERIA.items()]

    causes = Counter(g.failure_cause or "chưa phân loại" for g in final.values() if not is_pass(g))
    lines += ["", "## Nguyên nhân không đạt", "", "| Nguyên nhân | Số case |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in causes.most_common()] or ["| — | 0 |"]

    statuses = Counter(o.status for o in run.outputs.values())
    lat = [o.latency_ms for o in run.outputs.values() if o.status == "ok" and o.latency_ms is not None]
    lines += [
        "",
        "## Vận hành",
        "",
        f"- Trạng thái output: {dict(statuses)}",
        f"- Latency câu trả lời: p50 {_ms(percentile(lat, 50))} · p95 {_ms(percentile(lat, 95))} (đo phía client)",
        "- Token/chi phí: không có dữ liệu (chờ BL-25).",
        "",
        "## Người chấm",
        "",
        f"- Primary: {', '.join(sorted({g.grader for g in primary.values()}))} ({len(primary)} case)",
        f"- Người chấm thứ hai: {len(second)} case"
        + (f" ({100 * len(second) / len(case_ids):.0f}%)" if case_ids else "")
        + f" — yêu cầu ≥{config.second_grader_ratio:.0%} + toàn bộ ca tranh chấp",
        f"- Bất đồng/tranh chấp: {len(disputes)} — chưa được GV quyết định: {len(unresolved)}",
    ]
    if unresolved:
        lines.append(f"- Case cần GV quyết định: {', '.join(unresolved)}")
    if ungraded:
        lines.append(f"- Case chưa chấm ({len(ungraded)}): {', '.join(ungraded)}")
    fails = [cid for cid in case_ids if cid in final and not is_pass(final[cid])]
    lines += ["", "## Case không đạt", "", ", ".join(fails) or "Không có."]
    return "\n".join(lines) + "\n", complete


def safety_report(run: LoadedRun) -> tuple[str, bool]:
    path = run.path / "safety_results.jsonl"
    if not path.is_file():
        raise ConfigError(f"Không có {rel(path)}")
    results = [obj for _, obj in iter_jsonl(path)]
    lines = _run_header(run, "Báo cáo safety")
    by_cat: dict[str, Counter] = {}
    for r in results:
        by_cat.setdefault(r["category"], Counter())[r["result"]] += 1
    blocking = [r for r in results if r["result"] == "fail" and r["severity_if_fail"] in BLOCKING_SEVERITIES]
    pending = [r for r in results if r["result"] in ("needs_human", "blocked")]
    if blocking:
        verdict = f"**CHẶN PHÁT HÀNH** — {len(blocking)} ca P0/P1 fail"
    elif pending:
        verdict = f"**CHƯA KẾT LUẬN** — {len(pending)} ca cần người xem hoặc bị blocked (không tính là pass)"
    else:
        verdict = "Không còn ca P0/P1 fail trong bộ đã chạy"
    lines += [
        "## Kết luận",
        "",
        verdict,
        "",
        "## Theo nhóm",
        "",
        "| Nhóm | pass | fail | needs_human | blocked |",
        "|---|---|---|---|---|",
    ]
    for cat, c in sorted(by_cat.items()):
        lines.append(f"| {cat} | {c['pass']} | {c['fail']} | {c['needs_human']} | {c['blocked']} |")
    lines += ["", "## Ca fail", "", "| Case | Nhóm | Mức | UAT | Chi tiết |", "|---|---|---|---|---|"]
    for r in results:
        if r["result"] != "fail":
            continue
        details = "; ".join(
            f"bước {s['index']} {c['type']}: {c['detail']}"
            for s in r["steps"]
            for c in s["checks"]
            if c["result"] == "fail"
        )
        lines.append(
            f"| {r['case_id']} | {r['category']} | {r['severity_if_fail']} | {', '.join(r['related_uat'])} | {details} |"
        )
    lines += ["", "## Ca cần người xem / blocked", "", "| Case | Kết quả | Lý do |", "|---|---|---|"]
    for r in pending:
        reason = next((s["error"] for s in r["steps"] if s.get("error")), "cần người xem response")
        lines.append(f"| {r['case_id']} | {r['result']} | {reason} |")
    lines += ["", "Ca fail cần tạo bug theo mẫu backlog 15.2 trong `docs/bugs/`."]
    return "\n".join(lines) + "\n", not blocking and not pending


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Báo cáo accuracy/safety.")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--safety", action="store_true")
    args = parser.parse_args(argv)
    try:
        config = load_config()
        run = load_run(config, args.run_id)
        if args.safety:
            text, ok = safety_report(run)
            out = resolve(config.results_dir) / f"{args.run_id}_safety.md"
        else:
            if run.config.kind != "accuracy" or not run.cases:
                raise ConfigError("Lần chạy này không phải accuracy hoặc không đọc được dataset.")
            text, ok = accuracy_report(run, config, load_manifest(config))
            out = resolve(config.results_dir) / f"{args.run_id}.md"
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(text)
    print(f"Đã ghi {rel(out)}")
    return EXIT_OK if ok else EXIT_DATA_ERROR


if __name__ == "__main__":
    sys.exit(main())
