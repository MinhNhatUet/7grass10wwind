#!/usr/bin/env python3
"""Rebuild section-aware chunk artifacts from existing MinerU middle JSON.

The default output is separate from the current artifacts, so Published data and
existing embeddings are never overwritten by this utility.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.ingestion.chunking.chunker import build_chunks  # noqa: E402
from src.ingestion.metadata.schema import ResolvedMetadata  # noqa: E402
from src.ingestion.parsers.mineru_parser import _pages_from_mineru_json  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent


def _legacy_metadata(chunks_path: Path) -> dict:
    chunks = json.loads(chunks_path.read_text(encoding="utf-8"))
    if not chunks:
        raise ValueError(f"No legacy chunks in {chunks_path}")
    return chunks[0]


def _resolved_metadata(path: Path, version_id: str) -> ResolvedMetadata | None:
    if not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        if item.get("version", {}).get("id") == version_id:
            return ResolvedMetadata.model_validate(item)
    return None


def rebuild(
    mineru_root: Path,
    legacy_chunks_root: Path,
    output_root: Path,
    resolved_metadata_path: Path,
    target_tokens: int,
    max_tokens: int,
) -> dict[str, int]:
    output_root.mkdir(parents=True, exist_ok=True)
    summary = {"files": 0, "chunks": 0, "sectioned_chunks": 0}
    for version_dir in sorted(path for path in mineru_root.iterdir() if path.is_dir()):
        version_id = version_dir.name
        middle_files = sorted(version_dir.glob("*.json"))
        legacy_path = legacy_chunks_root / f"{version_id}.json"
        if not middle_files or not legacy_path.is_file():
            continue

        resolved = _resolved_metadata(resolved_metadata_path, version_id)
        if resolved is not None:
            document, version, acl, integrity = (
                resolved.document,
                resolved.version,
                resolved.acl,
                resolved.integrity,
            )
        else:
            legacy = _legacy_metadata(legacy_path)
            # Existing chunk artifacts carry the stable business IDs needed by
            # build_chunks. Technical fields below are placeholders only for
            # validation and are not written to the rebuilt chunks.
            from src.ingestion.models.document import Document, DocumentACL, DocumentVersion, IntegrityLabel

            document = Document(
                id=legacy["document_id"],
                course_id=legacy["course_id"],
                title=legacy["title"],
                document_type=legacy.get("document_type"),
            )
            version = DocumentVersion(
                id=version_id,
                document_id=document.id,
                checksum="0" * 64,
                storage_key="rebuild-only",
                filename=middle_files[0].stem,
                mime_type="application/pdf",
                size_bytes=1,
                revision=int(legacy.get("source_revision") or 1),
            )
            acl = DocumentACL(version_id=version_id, allowed_roles=["rebuild"])
            integrity = IntegrityLabel(version_id=version_id, type="learning_material")

        payload = json.loads(middle_files[0].read_text(encoding="utf-8"))
        pages = _pages_from_mineru_json(payload, version_id)
        chunks = build_chunks(
            document,
            version,
            acl,
            integrity,
            pages,
            target_tokens=target_tokens,
            max_tokens=max_tokens,
        )
        output = output_root / f"{version_id}.json"
        output.write_text(
            json.dumps([chunk.model_dump(mode="json") for chunk in chunks], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        summary["files"] += 1
        summary["chunks"] += len(chunks)
        summary["sectioned_chunks"] += sum(chunk.section is not None for chunk in chunks)
        print(f"- {version_id}: {len(pages)} pages -> {len(chunks)} chunks")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild section-aware chunks from existing MinerU JSON")
    parser.add_argument("--mineru-root", default="artifacts/mineru")
    parser.add_argument("--legacy-chunks", default="artifacts/chunks")
    parser.add_argument("--output", default="artifacts/chunks_sectioned")
    parser.add_argument("--resolved-metadata", default="artifacts/resolved_metadata.jsonl")
    parser.add_argument("--target-tokens", type=int, default=500)
    parser.add_argument("--max-tokens", type=int, default=800)
    args = parser.parse_args()
    summary = rebuild(
        REPO_ROOT / args.mineru_root,
        REPO_ROOT / args.legacy_chunks,
        REPO_ROOT / args.output,
        REPO_ROOT / args.resolved_metadata,
        args.target_tokens,
        args.max_tokens,
    )
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if summary["files"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
