#!/usr/bin/env python3
"""Backfill chunk_embeddings for chunks already stored in the database.

Typical Docker/PostgreSQL usage from repo root:
    $env:DATABASE_URL="postgresql+psycopg2://user:password@localhost:5432/ai20k"
    python scripts/backfill_embeddings.py --course SE101

The script is idempotent: chunks with current content_hash + embedding model/version are skipped.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from src.config import get_settings
from src.db import get_sessionmaker, init_db
from src.models.orm import PUBLISHED, Chunk, Document, DocumentVersion
from src.services.retrieval import (
    build_embedding_text,
    current_embedding_rows,
    embed_texts,
    embedding_identity,
    embedding_is_current,
    upsert_chunk_embedding,
)


def _versions(course_id: str | None, include_unpublished: bool) -> list[tuple[DocumentVersion, Document]]:
    db = get_sessionmaker()()
    try:
        stmt = select(DocumentVersion, Document).join(Document, Document.id == DocumentVersion.document_id)
        if course_id:
            stmt = stmt.where(Document.course_id == course_id)
        if not include_unpublished:
            stmt = stmt.where(DocumentVersion.state == PUBLISHED)
        return list(db.execute(stmt.order_by(Document.course_id, Document.title, DocumentVersion.created_at)).all())
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backfill embeddings for chunks already in the database.")
    parser.add_argument("--course", help="Only backfill one course_id, e.g. SE101")
    parser.add_argument("--include-unpublished", action="store_true", help="Also embed non-Published versions")
    parser.add_argument("--limit-versions", type=int, default=0, help="0 means all")
    args = parser.parse_args(argv)

    init_db()
    model, version_label, dimension = embedding_identity()
    if not get_settings().embedding_model:
        print("Missing EMBEDDING_MODEL. Configure .env or environment first.", file=sys.stderr)
        return 2

    rows = _versions(args.course, args.include_unpublished)
    if args.limit_versions:
        rows = rows[: args.limit_versions]
    if not rows:
        print("No document versions found. Import data into the database first.")
        return 1

    print(f"Embedding config: model={model} version={version_label} dimension={dimension or 'provider-default'}")
    total_embedded = 0
    total_skipped = 0
    db = get_sessionmaker()()
    try:
        for doc_version, document in rows:
            chunks = list(db.scalars(select(Chunk).where(Chunk.version_id == doc_version.id).order_by(Chunk.ordinal)))
            if not chunks:
                print(f"- {document.course_id} · {document.title}: no chunks")
                continue
            existing = current_embedding_rows(db, [chunk.id for chunk in chunks])
            todo = [
                chunk
                for chunk in chunks
                if not embedding_is_current(existing.get(chunk.id), chunk, doc_version, document)
            ]
            skipped = len(chunks) - len(todo)
            print(f"- {document.course_id} · {document.title[:70]}: {len(todo)} to embed, {skipped} current")
            batch_size = get_settings().embedding_batch_size
            for i in range(0, len(todo), batch_size):
                batch = todo[i : i + batch_size]
                texts = [build_embedding_text(chunk, doc_version, document) for chunk in batch]
                blobs = embed_texts(texts)
                if len(blobs) != len(batch):
                    raise RuntimeError("EMBEDDING_COUNT_MISMATCH")
                for chunk, blob in zip(batch, blobs, strict=True):
                    upsert_chunk_embedding(db, chunk, doc_version, document, blob)
                db.commit()
                total_embedded += len(batch)
                print(f"    embedded {min(i + len(batch), len(todo))}/{len(todo)}")
            total_skipped += skipped
    finally:
        db.close()

    print(f"Done: embedded={total_embedded}, skipped_current={total_skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
