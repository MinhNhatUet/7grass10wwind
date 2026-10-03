"""Embedding lại TOÀN BỘ chunk theo cấu hình EMBEDDING_* hiện tại (D-77: đổi nhà cung cấp/model embedding).

Vector của các model khác nhau không so sánh được với nhau, kể cả cùng số chiều — đổi provider/model thì phải chạy
script này cho mọi chunk (mọi trạng thái, để bản đang chờ duyệt/đang index cũng dùng model mới), rồi khởi động lại
backend. Mặc định chỉ in kế hoạch; thêm --apply để ghi. Ghi theo từng lô nên chạy lại được nếu dừng giữa chừng
(--only-missing bỏ qua chunk đã có vector — chỉ dùng khi chắc chắn vector đó đã là của model mới).

    python scripts/backfill_embeddings.py                    # xem kế hoạch
    python scripts/backfill_embeddings.py --apply            # embedding lại tất cả
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import get_settings  # noqa: E402
from src.db import get_sessionmaker, init_db  # noqa: E402
from src.models.orm import Chunk, Document, DocumentVersion  # noqa: E402
from src.services.retrieval import chunk_embedding_text, embed_texts  # noqa: E402

BATCH = 64  # số chunk mỗi lần ghi DB; embed_texts tự chia lô theo EMBEDDING_BATCH_SIZE


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Embedding lại toàn bộ chunk theo cấu hình EMBEDDING_* hiện tại")
    parser.add_argument("--course", help="Chỉ một môn, vd. SE101")
    parser.add_argument("--only-missing", action="store_true", help="Bỏ qua chunk đã có vector")
    parser.add_argument("--apply", action="store_true", help="Ghi vector vào DB (mặc định chỉ in kế hoạch)")
    args = parser.parse_args(argv)

    s = get_settings()
    if not s.embedding_model:
        print("Chưa cấu hình EMBEDDING_MODEL trong .env", file=sys.stderr)
        return 1
    init_db()
    db = get_sessionmaker()()
    try:
        query = select(Chunk).join(DocumentVersion, DocumentVersion.id == Chunk.version_id)
        if args.course:
            query = query.join(Document, Document.id == DocumentVersion.document_id).where(
                Document.course_id == args.course
            )
        if args.only_missing:
            query = query.where(Chunk.embedding.is_(None))
        chunks = list(db.scalars(query.order_by(Chunk.version_id, Chunk.ordinal)))
        print(
            f"Kế hoạch: {len(chunks)} chunk · provider={s.embedding_provider} · model={s.embedding_model} · "
            f"dimension={s.embedding_dimension or 'mặc định'} · {'OpenAI chính hãng' if s.embedding_api_key else 'endpoint cấu hình sẵn'}",
            flush=True,
        )
        if not args.apply:
            print("Chỉ xem kế hoạch. Thêm --apply để ghi.")
            return 0
        dims: set[int] = set()
        for i in range(0, len(chunks), BATCH):
            part = chunks[i : i + BATCH]
            blobs = embed_texts([chunk_embedding_text(c) for c in part])
            if len(blobs) != len(part):
                raise RuntimeError("EMBEDDING_COUNT_MISMATCH")
            for c, blob in zip(part, blobs, strict=True):
                c.embedding = blob
                dims.add(len(blob) // 4)
            db.commit()
            print(f"  {min(i + BATCH, len(chunks))}/{len(chunks)}", flush=True)
        print(f"Xong: {len(chunks)} chunk, số chiều {sorted(dims)}. Khởi động lại backend để dùng model mới.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
