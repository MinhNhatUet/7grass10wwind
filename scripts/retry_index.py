"""Thử lại lập chỉ mục cho các bản Failed đã được duyệt (vd. hết hạn mức embedding Gemini free tier).

Chạy từ gốc repo:
    python scripts/retry_index.py [--rounds 8] [--pause 120]

- Dùng đúng luồng `documents.retry` (có audit), người thực hiện = tài khoản có quyền duyệt môn.
- Mỗi lần thử chỉ embedding phần còn thiếu (chunk đã có embedding được giữ), nên chạy nhiều lần không tốn lại quota.
- Bản Failed ở bước trích xuất (chưa duyệt) sẽ được trích xuất lại, KHÔNG tự duyệt.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from eval.common import setup_console  # noqa: E402
from scripts.import_books import pick, wait_job  # noqa: E402
from src.db import get_sessionmaker, init_db  # noqa: E402
from src.models.orm import FAILED, Document, DocumentVersion  # noqa: E402
from src.services import documents  # noqa: E402
from src.services.errors import AppError  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    setup_console()
    parser = argparse.ArgumentParser(description="Thử lại index các bản Failed.")
    parser.add_argument("--rounds", type=int, default=8)
    parser.add_argument("--pause", type=int, default=120, help="giây nghỉ giữa các vòng")
    parser.add_argument("--timeout", type=int, default=3600)
    args = parser.parse_args(argv)

    init_db()
    db = get_sessionmaker()()
    try:
        for rnd in range(1, args.rounds + 1):
            db.expire_all()
            failed = list(db.scalars(select(DocumentVersion).where(DocumentVersion.state == FAILED)))
            if not failed:
                print("Xong: không còn bản Failed.")
                return 0
            for v in failed:
                d = db.get(Document, v.document_id)
                actor = pick(db, d.course_id, "review") or pick(db, d.course_id, "upload")
                if actor is None:
                    print(f"- {d.title}: không có tài khoản duyệt/tải của môn {d.course_id}, bỏ qua")
                    continue
                try:
                    job = documents.retry(db, actor, v.id)
                except AppError as e:
                    db.rollback()
                    print(f"- {d.title}: {e.code}")
                    continue
                job = wait_job(db, job.id, args.timeout)
                db.refresh(v)
                print(
                    f"vòng {rnd} · {d.course_id} · {d.title[:50]}: {job.kind} {job.status} {job.error_code or ''} → {v.state}"
                )
            time.sleep(args.pause)
    finally:
        db.close()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
