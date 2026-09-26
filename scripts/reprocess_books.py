"""Xử lý lại tài liệu đã phát hành bằng pipeline hiện tại (vd sau khi thêm bước làm sạch text, D-29).

Chạy từ gốc repo:
    python scripts/reprocess_books.py --course COURSE-01 --reason "Làm sạch text (D-29)"

Mỗi bản Published hiện hành → tạo VERSION MỚI cùng tệp gốc (BR-07) → trích xuất (có làm sạch) → gửi duyệt →
người duyệt KHÁC người tải duyệt → index → Published; bản cũ tự chuyển Archived khi bản mới phát hành.
Không bỏ qua HITL: dùng đúng các hàm dịch vụ như API.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from eval.common import setup_console  # noqa: E402
from scripts.import_books import pick, wait_job  # noqa: E402
from src.db import get_sessionmaker, init_db  # noqa: E402
from src.models.orm import FAILED, PUBLISHED, Document, DocumentVersion  # noqa: E402
from src.services import documents  # noqa: E402
from src.services.errors import AppError  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Xử lý lại tài liệu đã phát hành (tạo version mới, đủ HITL).")
    parser.add_argument("--course", required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args(argv)

    init_db()
    db = get_sessionmaker()()
    try:
        uploader, reviewer = pick(db, args.course, "upload"), pick(db, args.course, "review")
        if uploader is None or reviewer is None or uploader.id == reviewer.id:
            print("Thiếu tài khoản upload và/hoặc reviewer KHÁC nhau cho môn này.")
            return 1
        rows = db.execute(
            select(DocumentVersion, Document)
            .join(Document, Document.current_version_id == DocumentVersion.id)
            .where(Document.course_id == args.course, DocumentVersion.state == PUBLISHED)
        ).all()
        if not rows:
            print("Không có tài liệu Published nào trong môn.")
            return 0
        for old, doc in rows:
            print(f"- {doc.title} (bản cũ {old.id})")
            try:
                version, job = documents.reprocess(db, uploader, old.id, args.reason)
                job = wait_job(db, job.id, args.timeout)
                db.refresh(version)
                print(f"    trích xuất: {job.status} → {version.state}, cảnh báo {len(version.quality_warnings)}")
                if version.state == FAILED:
                    continue
                documents.submit(db, uploader, version.id, acknowledge_warnings=True)
                _, index_job = documents.decide(db, reviewer, version.id, "approve", args.reason, version.revision)
                index_job = wait_job(db, index_job.id, args.timeout)
                db.refresh(version)
                db.refresh(old)
                print(
                    f"    index: {index_job.status} {index_job.error_code or ''} → bản mới {version.state}, bản cũ {old.state}"
                )
            except AppError as e:
                db.rollback()
                print(f"    lỗi: {e.code} {e.message or ''}")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
