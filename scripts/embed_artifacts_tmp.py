#!/usr/bin/env python3
"""Embed artifact chunks into embedding_tmp without writing to the database.

Examples:
    python scripts/embed_artifacts_tmp.py --course SE101 --limit-files 1
    python scripts/embed_artifacts_tmp.py --course SE101 --limit-chunks 10
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import get_settings
from src.services.llm import get_embeddings
from src.services.retrieval import _is_rate_limit, embedding_identity, normalize_embedding_text

REPO_ROOT = Path(__file__).resolve().parent.parent


def _content_hash(chunk: dict[str, Any]) -> str:
    h = hashlib.sha256()
    for part in (
        str(chunk.get("document_id") or ""),
        str(chunk.get("version_id") or ""),
        str(chunk.get("source_revision") or ""),
        str(chunk.get("section") or ""),
        normalize_embedding_text(str(chunk.get("text") or "")),
    ):
        h.update(part.encode("utf-8"))
        h.update(b"\0")
    return h.hexdigest()


def _embedding_text(chunk: dict[str, Any]) -> str:
    locator = chunk.get("locator") or {}
    context = [
        f"Title: {chunk.get('title') or ''}",
        f"Document type: {chunk.get('document_type') or ''}",
    ]
    if chunk.get("section"):
        context.append(f"Section: {chunk['section']}")
    locator_start = locator.get("start") or locator.get("number") or ""
    locator_end = locator.get("end") or locator_start
    context.append(f"Locator: {locator.get('type') or ''} {locator_start}-{locator_end}")
    return "\n".join(context + ["", normalize_embedding_text(str(chunk.get("text") or ""))])


def _chunk_files(chunks_dir: Path, course_id: str | None) -> list[Path]:
    files = sorted(chunks_dir.glob("*.json"))
    if course_id is None:
        return files
    prefix = f"ver_{course_id.lower()}_"
    return [path for path in files if path.name.lower().startswith(prefix)]


def _validate_vector(vector: list[float], expected_dimension: int | None) -> None:
    if not vector:
        raise ValueError("EMBEDDING_INVALID_VECTOR")
    if expected_dimension is not None and len(vector) != expected_dimension:
        raise ValueError(f"VECTOR_DIMENSION_MISMATCH expected={expected_dimension} actual={len(vector)}")
    if any(value != value or value in (float("inf"), float("-inf")) for value in vector):
        raise ValueError("EMBEDDING_INVALID_VECTOR")


def _embed_batch(embedder: Any, texts: list[str]) -> list[list[float]]:
    settings = get_settings()
    for attempt in range(settings.embedding_max_retries + 1):
        try:
            vectors = embedder.embed_documents(texts)
            if len(vectors) != len(texts):
                raise ValueError("EMBEDDING_COUNT_MISMATCH")
            return vectors
        except Exception as exc:
            if not _is_rate_limit(exc) or attempt == settings.embedding_max_retries:
                raise
            time.sleep(min(settings.embedding_backoff_seconds * 2**attempt, 120))
    raise RuntimeError("unreachable")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Embed artifacts/chunks into a temp folder, no DB writes.")
    parser.add_argument("--chunks-dir", default="artifacts/chunks")
    parser.add_argument("--out", default="embedding_tmp")
    parser.add_argument("--course", help="Filter by course_id, e.g. SE101")
    parser.add_argument("--limit-files", type=int, default=0, help="0 means all matching chunk files")
    parser.add_argument("--limit-chunks", type=int, default=0, help="0 means all chunks per selected file")
    parser.add_argument("--no-vector", action="store_true", help="Write metadata only, without the vector array")
    args = parser.parse_args(argv)

    settings = get_settings()
    model, embedding_version, configured_dimension = embedding_identity()
    if not settings.embedding_model:
        print("Missing EMBEDDING_MODEL.", file=sys.stderr)
        return 2

    chunks_dir = (REPO_ROOT / args.chunks_dir).resolve()
    out_dir = (REPO_ROOT / args.out).resolve()
    files = _chunk_files(chunks_dir, args.course)
    if args.limit_files:
        files = files[: args.limit_files]
    if not files:
        print(f"No chunk artifact files found in {chunks_dir}")
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    embedder = get_embeddings()
    summary: dict[str, Any] = {
        "embedding_model": model,
        "embedding_version": embedding_version,
        "configured_dimension": configured_dimension,
        "chunks_dir": str(chunks_dir),
        "out_dir": str(out_dir),
        "files": [],
        "total_chunks": 0,
    }
    print(
        f"Embedding artifacts: model={model} version={embedding_version} "
        f"dimension={configured_dimension or 'provider-default'}"
    )

    for path in files:
        chunks = json.loads(path.read_text(encoding="utf-8"))
        if args.limit_chunks:
            chunks = chunks[: args.limit_chunks]
        if not chunks:
            continue
        version_id = str(chunks[0].get("version_id") or path.stem)
        output_path = out_dir / f"{version_id}.jsonl"
        written = 0
        detected_dimension: int | None = None
        with output_path.open("w", encoding="utf-8") as out:
            for start in range(0, len(chunks), settings.embedding_batch_size):
                batch = chunks[start : start + settings.embedding_batch_size]
                texts = [_embedding_text(chunk) for chunk in batch]
                vectors = _embed_batch(embedder, texts)
                for chunk, text, vector in zip(batch, texts, vectors, strict=True):
                    _validate_vector(vector, configured_dimension)
                    detected_dimension = len(vector)
                    record = {
                        "chunk_id": chunk.get("id"),
                        "document_id": chunk.get("document_id"),
                        "version_id": chunk.get("version_id"),
                        "course_id": chunk.get("course_id"),
                        "title": chunk.get("title"),
                        "locator": chunk.get("locator"),
                        "embedding_model": model,
                        "embedding_version": embedding_version,
                        "embedding_dimension": len(vector),
                        "content_hash": _content_hash(chunk),
                        "embedding_text_preview": text[:500],
                    }
                    if not args.no_vector:
                        record["vector"] = vector
                    out.write(json.dumps(record, ensure_ascii=False) + "\n")
                    written += 1
                print(f"- {path.name}: embedded {min(start + len(batch), len(chunks))}/{len(chunks)}")
                if settings.embedding_pause_seconds:
                    time.sleep(settings.embedding_pause_seconds)
        summary["files"].append(
            {
                "artifact": str(path.relative_to(REPO_ROOT)),
                "output": str(output_path.relative_to(REPO_ROOT)),
                "chunks": written,
                "detected_dimension": detected_dimension,
            }
        )
        summary["total_chunks"] += written

    (out_dir / "manifest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Done: wrote {summary['total_chunks']} embeddings to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
