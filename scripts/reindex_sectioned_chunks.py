#!/usr/bin/env python3
"""Re-embed section-aware MinerU chunks and safely publish them to the app DB.

Dry-run is the default.  ``--apply`` creates a new version for every matched
document, sends it through approval/indexing, and leaves the current Published
version untouched unless the full embedding job succeeds.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import func, select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import get_settings  # noqa: E402
from src.db import get_sessionmaker, init_db  # noqa: E402
from src.ingestion.chunking.serializers import serialize_element  # noqa: E402
from src.ingestion.parsers.mineru_parser import _pages_from_mineru_json  # noqa: E402
from src.models.orm import (  # noqa: E402
    APPROVED,
    DRAFT,
    FAILED,
    INDEXING,
    PENDING,
    PUBLISHED,
    AuditEvent,
    Chunk,
    Document,
    DocumentVersion,
    IngestionJob,
    User,
)
from src.services import documents  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Artifact:
    version_id: str
    source_stem: str
    chunks_path: Path
    mineru_path: Path
    chunks: list[dict[str, Any]]
    page_count: int

    @property
    def source(self) -> str:
        return self.chunks_path.relative_to(REPO_ROOT).as_posix()

    @property
    def sectioned_count(self) -> int:
        return sum(bool(chunk.get("section")) for chunk in self.chunks)


def _chunk_payload(raw_chunks: list[dict[str, Any]], mineru_path: Path, version_id: str) -> tuple[list[dict], int]:
    payload = json.loads(mineru_path.read_text(encoding="utf-8"))
    pages = _pages_from_mineru_json(payload, version_id)
    elements = {element.id: element for page in pages for element in page.elements}
    page_count = max((page.locator.number or 1 for page in pages), default=0)
    chunks: list[dict] = []
    for raw in raw_chunks:
        text = str(raw.get("text") or "").strip()
        cursor = 0
        page_map: list[list[int]] = []
        for element_id in raw.get("element_ids") or []:
            element = elements.get(str(element_id))
            if element is None or element.page_number is None:
                continue
            part = serialize_element(element).strip()
            if not part:
                continue
            position = text.find(part, cursor)
            if position < 0:
                continue
            if not page_map or page_map[-1][1] != element.page_number:
                page_map.append([position, element.page_number])
            cursor = position + len(part)
        locator = raw.get("locator") or {}
        fallback_page = int(locator.get("start") or locator.get("number") or 1)
        if page_map:
            page_map[0][0] = 0
        else:
            page_map = [[0, fallback_page]]
        chunks.append(
            {
                "page": page_map[0][1],
                "section": raw.get("section"),
                "text": text,
                "page_map": page_map,
            }
        )
    return chunks, page_count


def _load_artifacts(chunks_root: Path, mineru_root: Path) -> dict[str, Artifact]:
    artifacts: dict[str, Artifact] = {}
    for chunks_path in sorted(chunks_root.glob("*.json")):
        version_id = chunks_path.stem
        mineru_files = sorted((mineru_root / version_id).glob("*.json"))
        if len(mineru_files) != 1:
            raise ValueError(f"{version_id}: expected exactly one MinerU JSON, found {len(mineru_files)}")
        mineru_path = mineru_files[0]
        raw_chunks = json.loads(chunks_path.read_text(encoding="utf-8"))
        if not isinstance(raw_chunks, list) or not raw_chunks:
            raise ValueError(f"{chunks_path}: empty or invalid chunk artifact")
        chunks, page_count = _chunk_payload(raw_chunks, mineru_path, version_id)
        source_stem = mineru_path.stem.casefold()
        if source_stem in artifacts:
            raise ValueError(f"duplicate source filename stem: {mineru_path.stem}")
        artifacts[source_stem] = Artifact(
            version_id=version_id,
            source_stem=source_stem,
            chunks_path=chunks_path,
            mineru_path=mineru_path,
            chunks=chunks,
            page_count=page_count,
        )
    return artifacts


def _version_chunks(db, version_id: str) -> list[Chunk]:  # noqa: ANN001
    return list(db.scalars(select(Chunk).where(Chunk.version_id == version_id).order_by(Chunk.ordinal)))


def _content_matches(db, version_id: str, artifact: Artifact) -> bool:  # noqa: ANN001
    rows = _version_chunks(db, version_id)
    if len(rows) != len(artifact.chunks):
        return False
    return all(
        row.text == expected["text"]
        and row.section == (str(expected["section"]).strip() if expected.get("section") else None)
        and row.locator_value == expected["page"]
        and row.page_map == expected["page_map"]
        for row, expected in zip(rows, artifact.chunks, strict=True)
    )


def _embedding_stats(db, version_id: str) -> tuple[int, int, set[int]]:  # noqa: ANN001
    rows = _version_chunks(db, version_id)
    embedded = [row.embedding for row in rows if row.embedding is not None]
    return len(rows), len(embedded), {len(blob) // 4 for blob in embedded}


def _find_resumable(db, document_id: str, current_id: str, artifact: Artifact) -> DocumentVersion | None:  # noqa: ANN001
    candidates = db.scalars(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id, DocumentVersion.id != current_id)
        .order_by(DocumentVersion.created_at.desc())
    )
    for candidate in candidates:
        event = db.scalar(
            select(AuditEvent)
            .where(
                AuditEvent.object_id == candidate.id,
                AuditEvent.action == "reprocess_prechunked",
            )
            .order_by(AuditEvent.created_at.desc())
        )
        if event and event.detail.get("source") == artifact.source and _content_matches(db, candidate.id, artifact):
            return candidate
    return None


def _wait_job(db, job_id: str, timeout: int) -> IngestionJob:  # noqa: ANN001
    started = time.monotonic()
    last_report = -1
    while True:
        db.expire_all()
        job = db.get(IngestionJob, job_id)
        if job is None:
            raise RuntimeError(f"index job disappeared: {job_id}")
        percent = int(job.progress * 100)
        if percent != last_report:
            print(f"    embedding {percent}% ({job.status})", flush=True)
            last_report = percent
        if job.status in {"succeeded", "failed"}:
            return job
        if time.monotonic() - started > timeout:
            raise TimeoutError(f"index job {job_id} exceeded {timeout}s")
        time.sleep(3)


def _start_or_resume(db, uploader: User, reviewer: User, current: DocumentVersion, artifact: Artifact):  # noqa: ANN001
    version = _find_resumable(db, current.document_id, current.id, artifact)
    if version is None:
        version = documents.reprocess_prechunked(
            db,
            uploader,
            current.id,
            reason="Rebuild MinerU section-based chunks and embeddings",
            page_count=artifact.page_count,
            chunks=artifact.chunks,
            source=artifact.source,
        )
        print(f"    created draft {version.id}", flush=True)

    db.refresh(version)
    if version.state == DRAFT:
        documents.submit(db, uploader, version.id, acknowledge_warnings=True)
        db.refresh(version)
    if version.state == PENDING:
        version, job = documents.decide(
            db,
            reviewer,
            version.id,
            "approve",
            "Section-based MinerU re-index",
            version.revision,
        )
        return version, job
    if version.state == FAILED:
        return version, documents.retry(db, uploader, version.id)
    if version.state in {APPROVED, INDEXING}:
        job = db.scalar(
            select(IngestionJob)
            .where(IngestionJob.version_id == version.id, IngestionJob.kind == "index")
            .order_by(IngestionJob.created_at.desc())
        )
        if job is None:
            raise RuntimeError(f"{version.id}: {version.state} without index job")
        if job.status in {"queued", "running"}:
            documents.start_job(job.id)
        return version, job
    if version.state == PUBLISHED:
        job = db.scalar(
            select(IngestionJob)
            .where(IngestionJob.version_id == version.id, IngestionJob.kind == "index")
            .order_by(IngestionJob.created_at.desc())
        )
        return version, job
    raise RuntimeError(f"{version.id}: cannot resume state {version.state}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Safely publish and embed section-based MinerU chunks")
    parser.add_argument("--course", default="SE101")
    parser.add_argument("--chunks-root", default="artifacts/chunks_sectioned")
    parser.add_argument("--mineru-root", default="artifacts/mineru")
    parser.add_argument("--uploader", default="u_lecturer")
    parser.add_argument("--reviewer", default="u_reviewer")
    parser.add_argument("--timeout", type=int, default=3600, help="seconds per document")
    parser.add_argument("--allow-partial", action="store_true")
    parser.add_argument("--apply", action="store_true", help="write versions/embeddings to the database")
    args = parser.parse_args(argv)

    chunks_root = (REPO_ROOT / args.chunks_root).resolve()
    mineru_root = (REPO_ROOT / args.mineru_root).resolve()
    artifacts = _load_artifacts(chunks_root, mineru_root)
    init_db()
    db = get_sessionmaker()()
    try:
        rows = db.execute(
            select(Document, DocumentVersion)
            .join(DocumentVersion, DocumentVersion.id == Document.current_version_id)
            .where(Document.course_id == args.course)
            .order_by(Document.title)
        ).all()
        mapped: list[tuple[Document, DocumentVersion, Artifact]] = []
        missing: list[str] = []
        used: set[str] = set()
        for document, version in rows:
            key = Path(version.original_filename).stem.casefold()
            artifact = artifacts.get(key)
            if artifact is None:
                missing.append(version.original_filename)
                continue
            mapped.append((document, version, artifact))
            used.add(key)
        unused = sorted(artifact.mineru_path.name for key, artifact in artifacts.items() if key not in used)
        if (missing or unused) and not args.allow_partial:
            print(f"Mapping incomplete: missing_db_artifacts={missing}, unused_artifacts={unused}", file=sys.stderr)
            return 2
        if not mapped:
            print("No matching current document versions.", file=sys.stderr)
            return 2

        total_chunks = sum(len(artifact.chunks) for _, _, artifact in mapped)
        total_sections = sum(artifact.sectioned_count for _, _, artifact in mapped)
        settings = get_settings()
        print(
            f"Plan: course={args.course}, documents={len(mapped)}, chunks={total_chunks}, "
            f"sectioned={total_sections}, provider={settings.embedding_provider}, "
            f"model={settings.embedding_model}, dimension={settings.embedding_dimension or 'provider-default'}"
        )
        for document, version, artifact in mapped:
            print(f"- {document.title}: {version.id} -> {len(artifact.chunks)} chunks")
        if not args.apply:
            print("Dry-run only. Re-run with --apply to write to the database.")
            return 0

        uploader, reviewer = db.get(User, args.uploader), db.get(User, args.reviewer)
        if uploader is None or reviewer is None:
            print("Uploader or reviewer user does not exist.", file=sys.stderr)
            return 2
        if uploader.id == reviewer.id:
            print("Uploader and reviewer must be different users.", file=sys.stderr)
            return 2

        published = skipped = 0
        for index, (document, planned_current, artifact) in enumerate(mapped, start=1):
            db.expire_all()
            current_id = db.get(Document, document.id).current_version_id
            current = db.get(DocumentVersion, current_id)
            if current is None:
                raise RuntimeError(f"{document.id}: current version disappeared")
            total, embedded, dimensions = _embedding_stats(db, current.id)
            expected_dimension = settings.embedding_dimension
            dimension_ok = not expected_dimension or dimensions == {expected_dimension}
            if _content_matches(db, current.id, artifact) and embedded == total and dimension_ok:
                print(f"[{index}/{len(mapped)}] {document.title}: already current and embedded; skip", flush=True)
                skipped += 1
                continue

            print(f"[{index}/{len(mapped)}] {document.title}: indexing {len(artifact.chunks)} chunks", flush=True)
            version, job = _start_or_resume(db, uploader, reviewer, current, artifact)
            if job is not None and job.status not in {"succeeded", "failed"}:
                job = _wait_job(db, job.id, args.timeout)
            db.expire_all()
            version = db.get(DocumentVersion, version.id)
            if version.state != PUBLISHED or (job is not None and job.status != "succeeded"):
                error = job.error_code if job is not None else "MISSING_INDEX_JOB"
                print(f"    FAILED safely: state={version.state}, error={error}", file=sys.stderr)
                return 1
            total, embedded, dimensions = _embedding_stats(db, version.id)
            if total != len(artifact.chunks) or embedded != total:
                raise RuntimeError(f"{version.id}: embedding verification failed ({embedded}/{total})")
            if expected_dimension and dimensions != {expected_dimension}:
                raise RuntimeError(f"{version.id}: vector dimensions {dimensions}, expected {expected_dimension}")
            print(
                f"    published {version.id}: {embedded}/{total} embeddings, dimensions={sorted(dimensions)}",
                flush=True,
            )
            published += 1

        current_versions = list(
            db.scalars(
                select(DocumentVersion)
                .join(Document, Document.id == DocumentVersion.document_id)
                .where(
                    Document.course_id == args.course,
                    Document.current_version_id == DocumentVersion.id,
                    DocumentVersion.state == PUBLISHED,
                )
            )
        )
        final_chunks = int(
            db.scalar(
                select(func.count(Chunk.id))
                .join(DocumentVersion, DocumentVersion.id == Chunk.version_id)
                .join(Document, Document.id == DocumentVersion.document_id)
                .where(Document.course_id == args.course, Document.current_version_id == DocumentVersion.id)
            )
            or 0
        )
        print(
            f"Done: published={published}, skipped={skipped}, current_versions={len(current_versions)}, "
            f"current_chunks={final_chunks}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
