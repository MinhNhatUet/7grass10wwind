"""Kiểm kê nguồn: kiểm tra manifest theo AC của BL-02 (FR-06, BR-01, BR-06, BR-07).

Chạy từ gốc repo:
    python scripts/validate_manifest.py [--manifest PATH] [--check-files] [--report PATH]

Manifest mặc định: config.manifest_path (MVP: data/raw/books/manifest.books.json).
Script chỉ BÁO CÁO, không sửa manifest.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.common import (  # noqa: E402
    EXIT_CONFIG_ERROR,
    EXIT_DATA_ERROR,
    EXIT_OK,
    ConfigError,
    load_config,
    load_manifest,
    rel,
    resolve,
    setup_console,
    sha256_file,
)
from eval.schemas import EvalConfig, Manifest, ManifestSource  # noqa: E402

REQUIRED_FIELDS = ("source_id", "course_id", "title", "file_type", "version", "usage_permission")

# Loại mẫu kiểm thử bắt buộc theo AC 3 của BL-02 (+ tài liệu tính điểm cho BR-06)
SAMPLE_CATEGORIES: dict[str, str] = {
    "valid_pdf_text": "PDF có lớp text hợp lệ",
    "pptx": "Slide PPTX hợp lệ",
    "pdf_scan": "PDF chỉ có ảnh (OCR, UAT-12)",
    "corrupt_or_encrypted": "File lỗi/có mật khẩu/tải lỗi",
    "duplicate": "Trùng nội dung (cùng sha256)",
    "two_versions": "Hai phiên bản cùng tài liệu (supersedes)",
    "graded_material": "Tài liệu tính điểm/đáp án (BR-06)",
}


@dataclass
class Finding:
    level: Literal["ERROR", "WARNING"]
    code: str
    message: str
    source_id: str | None = None

    def __str__(self) -> str:
        where = f" [{self.source_id}]" if self.source_id else ""
        return f"{self.level:7} {self.code}{where}: {self.message}"


def check_sources(manifest: Manifest, config: EvalConfig) -> list[Finding]:
    findings: list[Finding] = []
    enums = config.manifest_enums
    courses = manifest.course_names()

    for c in manifest.courses:
        allowed = enums.get("course.status")
        if allowed and c.status not in allowed:
            findings.append(Finding("ERROR", "M-03", f"môn {c.course_id}: status '{c.status}' không thuộc {allowed}"))

    ids = Counter(s.source_id for s in manifest.sources)
    for sid, n in ids.items():
        if n > 1:
            findings.append(Finding("ERROR", "M-11", f"source_id lặp {n} lần", sid))

    by_sha: dict[str, list[str]] = defaultdict(list)
    for s in manifest.sources:
        if s.sha256:
            by_sha[s.sha256].append(s.source_id or "?")
    for sids in by_sha.values():
        if len(sids) > 1:
            findings.append(Finding("WARNING", "M-11", f"trùng sha256: {', '.join(sids)}"))

    known_ids = set(ids)
    for s in manifest.sources:
        sid = s.source_id
        missing = [f for f in REQUIRED_FIELDS if not getattr(s, f)]
        if missing:
            findings.append(Finding("ERROR", "M-01", f"thiếu trường: {', '.join(missing)}", sid))
        if s.course_id and s.course_id not in courses:
            findings.append(Finding("ERROR", "M-02", f"course_id '{s.course_id}' không có trong courses", sid))
        for field in ("file_type", "usage_permission"):
            allowed = enums.get(field)
            value = getattr(s, field)
            if allowed and value and value not in allowed:
                findings.append(Finding("ERROR", "M-03", f"{field}='{value}' không thuộc {allowed}", sid))

        if s.usage_permission == "allowed" and not (s.confirmed_by and s.confirmed_at):
            findings.append(
                Finding("ERROR", "M-05", "usage_permission=allowed nhưng thiếu confirmed_by/confirmed_at", sid)
            )
        if s.is_graded_material and "student" in s.acl.roles:
            findings.append(Finding("ERROR", "M-06", "tài liệu tính điểm/đáp án không được có ACL student", sid))
        if not (s.owner or s.confirmed_by):
            findings.append(Finding("WARNING", "M-07", "chưa có chủ sở hữu/người xác nhận", sid))
        if s.license_checked is False:
            findings.append(Finding("WARNING", "M-07", f"giấy phép '{s.license}' chưa được đối chiếu", sid))
        if s.supersedes:
            if s.supersedes not in known_ids:
                findings.append(Finding("ERROR", "M-09", f"supersedes '{s.supersedes}' không tồn tại", sid))
            elif s.supersedes == sid:
                findings.append(Finding("ERROR", "M-09", "supersedes trỏ vào chính nó", sid))
        if s.storage_ref and s.course_id in courses:
            folder = Path(s.storage_ref).parent.name
            if folder != courses[s.course_id]:
                findings.append(
                    Finding("WARNING", "M-13", f"thư mục '{folder}' khác tên môn '{courses[s.course_id]}' (R-09)", sid)
                )
    findings += _check_supersede_cycles(manifest)
    return findings


def _check_supersede_cycles(manifest: Manifest) -> list[Finding]:
    nxt = {s.source_id: s.supersedes for s in manifest.sources if s.source_id and s.supersedes}
    findings = []
    for start in nxt:
        seen, cur = set(), start
        while cur in nxt:
            if cur in seen:
                findings.append(Finding("ERROR", "M-09", "chuỗi supersedes tạo vòng", start))
                break
            seen.add(cur)
            cur = nxt[cur]
    return findings


def check_files(manifest: Manifest) -> list[Finding]:
    """M-08: file tải về phải tồn tại và sha256 khớp."""
    findings = []
    for s in manifest.sources:
        sid = s.source_id
        if not s.storage_ref:
            findings.append(Finding("ERROR", "M-08", "thiếu storage_ref", sid))
            continue
        path = resolve(s.storage_ref)
        if not path.is_file():
            level = "WARNING" if s.fetch_error else "ERROR"
            note = f" (fetch_error: {s.fetch_error})" if s.fetch_error else ""
            findings.append(Finding(level, "M-08", f"không có file {s.storage_ref}{note}", sid))
            continue
        if s.sha256 and sha256_file(path) != s.sha256:
            findings.append(Finding("ERROR", "M-08", "sha256 không khớp với file trên máy", sid))
    return findings


def sample_coverage(manifest: Manifest) -> dict[str, list[str]]:
    """M-10: nguồn đại diện cho từng loại mẫu kiểm thử (tính từ dữ liệu, không khai báo tay)."""
    cov: dict[str, list[str]] = {k: [] for k in SAMPLE_CATEGORIES}
    sha_count = Counter(s.sha256 for s in manifest.sources if s.sha256)
    superseded = {s.supersedes for s in manifest.sources if s.supersedes}
    for s in manifest.sources:
        sid = s.source_id or "?"
        if s.file_type == "pdf_text" and s.has_text_layer and not s.encrypted and not s.fetch_error:
            cov["valid_pdf_text"].append(sid)
        if s.file_type == "pptx":
            cov["pptx"].append(sid)
        if s.file_type == "pdf_scan" or s.has_text_layer is False:
            cov["pdf_scan"].append(sid)
        if s.encrypted or s.fetch_error:
            cov["corrupt_or_encrypted"].append(sid)
        if s.sha256 and sha_count[s.sha256] > 1:
            cov["duplicate"].append(sid)
        if s.supersedes or s.source_id in superseded:
            cov["two_versions"].append(sid)
        if s.is_graded_material:
            cov["graded_material"].append(sid)
    return cov


def eligibility(manifest: Manifest) -> tuple[list[ManifestSource], list[ManifestSource]]:
    """BR-01: tách nguồn đủ / chưa đủ điều kiện phục vụ."""
    ok = [s for s in manifest.sources if s.eligible_for_serving]
    return ok, [s for s in manifest.sources if not s.eligible_for_serving]


def build_report(
    manifest: Manifest, manifest_path: Path, findings: list[Finding], cov: dict[str, list[str]], files_checked: bool
) -> str:
    names = manifest.course_names()
    eligible, blocked = eligibility(manifest)
    errors = [f for f in findings if f.level == "ERROR"]
    warnings = [f for f in findings if f.level == "WARNING"]
    lines = [
        "# Báo cáo kiểm kê nguồn (BL-02)",
        "",
        f"- Manifest: `{rel(manifest_path)}` (version {manifest.manifest_version}, status {manifest.status})",
        f"- Thời điểm: {datetime.now(UTC).isoformat(timespec='seconds')}",
        f"- Kiểm tra file thật: {'có' if files_checked else 'không (--check-files để bật)'}",
        f"- Kết quả: {len(errors)} ERROR, {len(warnings)} WARNING",
        "",
        "## Theo môn",
        "",
        "| Môn | Tên | Trạng thái | Số nguồn | Tổng trang | Đủ điều kiện phục vụ |",
        "|---|---|---|---|---|---|",
    ]
    for c in manifest.courses:
        srcs = [s for s in manifest.sources if s.course_id == c.course_id]
        pages = sum(s.page_count or 0 for s in srcs)
        ok = sum(1 for s in srcs if s.eligible_for_serving)
        lines.append(f"| {c.course_id} | {c.name} | {c.status} | {len(srcs)} | {pages} | {ok} |")
    lines += [
        "",
        "## Điều kiện phục vụ (BR-01)",
        "",
        f"Đủ điều kiện: **{len(eligible)}/{len(manifest.sources)}**. Điều kiện: `usage_permission=allowed`, "
        "`ai_processing_allowed=true`, có `confirmed_by`, có `acl.roles`. Nguồn chưa đủ **không được đưa vào "
        "pipeline phục vụ**.",
        "",
        "| Lý do chưa đủ | Số nguồn |",
        "|---|---|",
    ]
    reasons = Counter()
    for s in blocked:
        if s.usage_permission != "allowed":
            reasons[f"usage_permission = {s.usage_permission}"] += 1
        if s.ai_processing_allowed is not True:
            reasons[f"ai_processing_allowed = {s.ai_processing_allowed}"] += 1
        if not s.confirmed_by:
            reasons["chưa có confirmed_by"] += 1
        if not s.acl.roles:
            reasons["acl.roles rỗng"] += 1
    lines += [f"| {r} | {n} |" for r, n in reasons.most_common()]
    lines += ["", "## Mẫu kiểm thử (AC 3)", "", "| Loại | Mục đích | Nguồn | Trạng thái |", "|---|---|---|---|"]
    for key, purpose in SAMPLE_CATEGORIES.items():
        sids = cov[key]
        lines.append(f"| {key} | {purpose} | {', '.join(sids) or '—'} | {'có' if sids else '**thiếu**'} |")
    lines += ["", "## Danh sách phát hiện", ""]
    lines += [f"- {f}" for f in errors + warnings] or ["- Không có."]
    lines += [
        "",
        "## Nguồn",
        "",
        "| source_id | Môn | Tiêu đề | Giấy phép | Đã đối chiếu | Trang |",
        "|---|---|---|---|---|---|",
    ]
    for s in manifest.sources:
        lines.append(
            f"| {s.source_id} | {names.get(s.course_id or '', s.course_id)} | {s.title} | {s.license} | "
            f"{'có' if s.license_checked else 'chưa'} | {s.page_count or '?'} |"
        )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Kiểm tra manifest nguồn (BL-02).")
    parser.add_argument("--manifest", help="mặc định: config.manifest_path")
    parser.add_argument("--check-files", action="store_true", help="đối chiếu file thật và sha256")
    parser.add_argument("--report", help="ghi báo cáo markdown ra PATH")
    args = parser.parse_args(argv)

    try:
        config = load_config()
        manifest_path = resolve(args.manifest or config.manifest_path)
        manifest = load_manifest(config, manifest_path)
    except ConfigError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return EXIT_CONFIG_ERROR

    findings = check_sources(manifest, config)
    if args.check_files:
        findings += check_files(manifest)
    cov = sample_coverage(manifest)
    for key, sids in cov.items():
        if not sids:
            findings.append(Finding("WARNING", "M-10", f"thiếu mẫu '{key}': {SAMPLE_CATEGORIES[key]}"))

    eligible, _ = eligibility(manifest)
    errors = [f for f in findings if f.level == "ERROR"]
    warnings = [f for f in findings if f.level == "WARNING"]
    print(f"Manifest: {rel(manifest_path)} — {len(manifest.courses)} môn, {len(manifest.sources)} nguồn")
    for c in manifest.courses:
        n = sum(1 for s in manifest.sources if s.course_id == c.course_id)
        print(f"  {c.course_id} {c.name} ({c.status}): {n} nguồn")
    print(f"Đủ điều kiện phục vụ (BR-01): {len(eligible)}/{len(manifest.sources)}")
    for f in errors + warnings:
        print(f)
    print(f"Kết quả: {len(errors)} ERROR, {len(warnings)} WARNING")

    if args.report:
        out = resolve(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(build_report(manifest, manifest_path, findings, cov, args.check_files), encoding="utf-8")
        print(f"Đã ghi báo cáo: {rel(out)}")
    return EXIT_DATA_ERROR if errors else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
