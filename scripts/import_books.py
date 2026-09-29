"""Đưa sách dev (manifest) qua ĐÚNG luồng tài liệu: upload → trích xuất → gửi duyệt → người duyệt khác duyệt
→ index → Published. Không có đường tắt bỏ qua HITL (BR-01, FR-08).

Chạy từ gốc repo:
    python scripts/import_books.py --course COURSE-01 --limit 1 --confirm-dev-usage [--fixtures local] [--wait]

- Sách trong manifest đang ở trạng thái "dev_only_pending_confirmation". Gửi duyệt đòi usage_permission=confirmed,
  nên PHẢI truyền --confirm-dev-usage: người chạy xác nhận dùng sách cho dev/MVP (D-02). Việc xác nhận được ghi audit.
- Người tải = tài khoản có quyền upload môn; người duyệt = tài khoản reviewer có quyền duyệt môn và KHÁC người tải.
- ACL: student + lecturer + reviewer; không cho SV tải bản gốc (mặc định hạn chế).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from src.db import get_sessionmaker, init_db  # noqa: E402
from src.models.orm import FAILED, PUBLISHED, DocumentVersion, IngestionJob, Membership, User  # noqa: E402
from src.services import acl, audit, documents  # noqa: E402
from src.services.errors import AppError  # noqa: E402

DOC_TYPE = "textbook"
REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Source:
    source_id: str
    course_id: str
    title: str | None
    authors: str | None
    url: str | None
    license: str | None
    storage_ref: str | None
    sha256: str | None
    version: str | None
    fetch_error: str | None
    encrypted: bool


def setup_console() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def resolve(path: str) -> Path:
    p = Path(path)
    return p if p.is_absolute() else REPO_ROOT / p


def load_manifest(path: str | Path = "data/raw/books/manifest.books.json"):
    data = json.loads(resolve(str(path)).read_text(encoding="utf-8"))
    sources = []
    for item in data.get("sources", []):
        sources.append(
            Source(
                source_id=str(item.get("source_id") or ""),
                course_id=str(item.get("course_id") or ""),
                title=item.get("title"),
                authors=item.get("authors"),
                url=item.get("url"),
                license=item.get("license"),
                storage_ref=item.get("storage_ref"),
                sha256=item.get("sha256"),
                version=item.get("version"),
                fetch_error=item.get("fetch_error"),
                encrypted=bool(item.get("encrypted")),
            )
        )

    class Manifest:
        pass

    manifest = Manifest()
    manifest.sources = sources
    return manifest


def wait_job(db, job_id: str, timeout_s: int) -> IngestionJob:  # noqa: ANN001
    start = time.monotonic()
    while True:
        db.expire_all()
        job = db.get(IngestionJob, job_id)
        if job.status in ("succeeded", "failed") or time.monotonic() - start > timeout_s:
            return job
        print(f"    … {job.kind} {job.status} {job.progress:.0%}", end="\r")
        time.sleep(3)


def pick(db, course_id: str, need: str) -> User | None:  # noqa: ANN001
    for m in db.scalars(select(Membership).where(Membership.course_id == course_id)):
        user = db.get(User, m.user_id)
        ok = acl.can_review(db, user, course_id) if need == "review" else acl.can_upload(db, user, course_id)
        if ok and user.role != ("reviewer" if need == "upload" else "_"):
            return user
    return None


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Import sách dev qua luồng upload → duyệt → publish.")
    parser.add_argument("--course", required=True)
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--source-id", action="append", help="chỉ import source_id này (lặp lại được)")
    parser.add_argument("--confirm-dev-usage", action="store_true", help="xác nhận dùng sách dev cho MVP (bắt buộc)")
    parser.add_argument(
        "--wait", action=argparse.BooleanOptionalAction, default=True, help="chờ index xong (mặc định có)"
    )
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args(argv)

    if not args.confirm_dev_usage:
        print("Cần --confirm-dev-usage: sách trong manifest chưa được xác nhận quyền sử dụng chính thức (Q-09).")
        return 2
    try:
        manifest = load_manifest()
    except Exception as e:
        print(f"Lỗi đọc manifest: {e}", file=sys.stderr)
        return 2
    sources = [s for s in manifest.sources if s.course_id == args.course and not s.fetch_error and not s.encrypted]
    if args.source_id:
        sources = [s for s in sources if s.source_id in args.source_id]
    sources = sources[: args.limit]
    if not sources:
        print("Không có sách phù hợp trong manifest.")
        return 1

    init_db()
    db = get_sessionmaker()()
    try:
        uploader, reviewer = pick(db, args.course, "upload"), pick(db, args.course, "review")
        if uploader is None or reviewer is None or uploader.id == reviewer.id:
            print("Thiếu tài khoản upload và/hoặc reviewer KHÁC nhau cho môn này — chạy seed_users.py / sửa fixtures.")
            return 1
        for s in sources:
            path = resolve(s.storage_ref or "")
            if not path.is_file():
                print(f"- {s.source_id}: không có file, bỏ qua")
                continue
            existing = db.scalar(select(DocumentVersion).where(DocumentVersion.checksum == s.sha256))
            if existing is not None:
                print(f"- {s.source_id}: đã có ({existing.state}), bỏ qua")
                continue
            print(f"- {s.source_id}: {s.title}")
            meta = documents.VersionMeta(
                title=s.title or s.source_id, doc_type=DOC_TYPE, version_label=s.version or "1",
                provenance=f"{s.url or ''} · license: {s.license} · manifest {s.source_id}", usage_permission="confirmed",
                acl_roles=["student", "lecturer", "reviewer"], download_allowed=False, integrity_label="learning_material",
                authors=s.authors,
            )  # fmt: skip
            try:
                version, job = documents.upload(db, uploader, args.course, path.read_bytes(), path.name, meta, None)
                audit.record(
                    db, actor_id=None, action="confirm_dev_usage", object_type="version", object_id=version.id,
                    course_id=args.course, reason="import_books --confirm-dev-usage (D-02: sách dev cho MVP)",
                )  # fmt: skip
                db.commit()
                job = wait_job(db, job.id, args.timeout)
                db.refresh(version)
                print(
                    f"    trích xuất: {job.status} → {version.state}, {version.page_count} trang, cảnh báo {len(version.quality_warnings)}"
                )
                if version.state == FAILED:
                    continue
                documents.submit(db, uploader, version.id, acknowledge_warnings=True)
                _, index_job = documents.decide(
                    db, reviewer, version.id, "approve", "Import sách dev MVP", version.revision
                )
                print(f"    đã duyệt bởi {reviewer.display_name}; index job {index_job.id}")
                if args.wait:
                    index_job = wait_job(db, index_job.id, args.timeout)
                    db.refresh(version)
                    print(f"    index: {index_job.status} {index_job.error_code or ''} → {version.state}")
                    if version.state != PUBLISHED:
                        print("    ⚠️ chưa Published — xem job/error_code, retry: POST /api/v1/versions/{id}/retry")
            except AppError as e:
                db.rollback()
                print(f"    lỗi: {e.code} {e.message or ''}")
    finally:
        db.close()
    if not args.wait:
        print("Index chạy trong tiến trình này — dùng --wait để chờ xong (tiến trình kết thúc sẽ dừng job nền).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
