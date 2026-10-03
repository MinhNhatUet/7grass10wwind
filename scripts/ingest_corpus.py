from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.ingestion.course_registry import CourseRegistry
from src.ingestion.formula.config import FormulaFallbackConfig
from src.ingestion.inventory.scanner import scan_corpus
from src.ingestion.metadata.loader import load_course_defaults, load_document_overrides
from src.ingestion.parsers.mineru_parser import MinerUParser
from src.ingestion.parsers.pdf_parser import PDFNativeParser
from src.ingestion.parsers.pptx_parser import PPTXNativeParser
from src.ingestion.pipeline import IngestionPipelineError, ingest_record, inventory_for_path, select_parser


def main() -> None:
    parser = argparse.ArgumentParser(description="Run baseline ingestion for one file or a corpus.")
    parser.add_argument("--root", default="src/data", help="Raw corpus root")
    parser.add_argument("--path", default=None, help="Single file to ingest, under --root")
    parser.add_argument("--all", action="store_true", help="Ingest every parser-supported file under --root")
    parser.add_argument("--courses", default="config/courses.yaml")
    parser.add_argument("--defaults", default="config/metadata_defaults.yaml")
    parser.add_argument("--overrides", default="config/document_overrides.yaml")
    parser.add_argument("--artifacts", default="artifacts")
    parser.add_argument("--mineru-timeout-seconds", type=int, default=1800)
    parser.add_argument("--no-mineru", action="store_true", help="Skip MinerU and use native parsers only")
    parser.add_argument("--device", choices=["auto", "cpu", "gpu", "cuda"], default="auto")
    args = parser.parse_args()

    if not args.path and not args.all:
        raise SystemExit("Use --path <file> or --all")

    registry = CourseRegistry.load(args.courses)
    defaults = load_course_defaults(args.defaults)
    overrides = load_document_overrides(args.overrides)
    if args.path:
        records = [inventory_for_path(args.root, args.path, registry)]
    else:
        records = scan_corpus(args.root, registry)

    completed = 0
    skipped = 0
    failed = 0
    parsers = _build_parsers(args)
    for record in records:
        try:
            select_parser(record.mime_type, parsers=parsers, artifact_root=args.artifacts, device=args.device)
        except IngestionPipelineError:
            skipped += 1
            continue
        try:
            result = ingest_record(
                record=record,
                raw_root=args.root,
                course_defaults=defaults,
                document_override=overrides.get(record.relative_path),
                artifact_root=args.artifacts,
                parsers=parsers,
                device=args.device,
            )
        except Exception as exc:
            failed += 1
            print(f"{record.relative_path}: FAILED {type(exc).__name__}: {exc}")
            if args.path:
                raise
            continue
        completed += 1
        print(
            f"{record.relative_path}: pages/slides={result['page_count']} "
            f"chunks={result['chunk_count']} needs_review={result['quality_report']['needs_review']}"
        )

    print(f"Ingestion complete: {completed} completed, {skipped} skipped, {failed} failed")


def _build_parsers(args):
    parsers = []
    if not args.no_mineru:
        parsers.append(
            MinerUParser(
                artifact_root=args.artifacts,
                timeout_seconds=args.mineru_timeout_seconds,
                device=args.device,
            )
        )
    formula_config = FormulaFallbackConfig(device=args.device)
    parsers.extend([PDFNativeParser(artifact_root=args.artifacts, formula_config=formula_config), PPTXNativeParser()])
    return parsers


if __name__ == "__main__":
    main()
