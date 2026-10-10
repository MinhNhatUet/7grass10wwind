"""Parse + chunk bằng luồng nhanh (pdfium) + bổ sung công thức/OCR bằng vision LLM, ghi JSON như ingest_corpus.py.

Không đụng DB, không embed. Đầu ra: <artifacts>/pages|chunks|quality_reports/<version_id>.json
Ví dụ: python scripts/ingest_fast.py --path "src/data/Đại số tuyến tính/chapter1-exercises.pdf"
"""

from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import get_settings
from src.ingestion.chunking.structure import Chunk
from src.ingestion.course_registry import CourseRegistry
from src.ingestion.metadata.loader import load_course_defaults, load_document_overrides
from src.ingestion.metadata.resolver import resolve_metadata
from src.ingestion.models.page import Locator, PageIR
from src.ingestion.pipeline import inventory_for_path, write_json
from src.services import ingestion, page_enrichment, page_render, storage


def enrich_pages(extraction: ingestion.Extraction, storage_key: str) -> tuple[dict[int, dict], list[dict]]:
    """Chạy enrich cho các trang được đánh dấu; sửa extraction.chunks tại chỗ như documents._apply_enrichment."""
    s = get_settings()
    page_text: dict[int, str] = {}
    for c in extraction.chunks:
        page_text[c.locator_value] = (page_text.get(c.locator_value, "") + "\n" + c.text).strip()

    def work(number: int, kind: str) -> page_enrichment.PageResult:
        image = page_render.render_png(storage_key, number, width=s.enrich_render_width)
        return page_enrichment.enrich_page(
            number, kind, image, page_text.get(number, ""), page_text.get(number - 1, ""),
            page_text.get(number + 1, ""),
        )  # fmt: skip

    details: dict[int, dict] = {}
    warnings: list[dict] = []
    with ThreadPoolExecutor(max_workers=s.enrich_concurrency) as pool:
        futures = {pool.submit(work, e["locator_value"], e["kind"]): e for e in extraction.enrich}
        for future in as_completed(futures):
            entry = futures[future]
            number = entry["locator_value"]
            try:
                result = future.result()
            except Exception as e:  # noqa: BLE001 — một trang lỗi: giữ text nhanh, ghi cảnh báo
                code = e.code if isinstance(e, page_enrichment.EnrichError) else f"INTERNAL_{type(e).__name__}"
                warnings.append({"locator_type": "page", "locator_value": number, "issue": "enrich_failed",
                                 "kind": entry["kind"], "error": code})  # fmt: skip
                details[number] = {"kind": entry["kind"], "status": "failed", "error": code}
                continue
            warning = result.warning()
            if warning:
                warnings.append(warning)
            _apply(extraction, result, warning)
            details[number] = {
                "kind": result.kind,
                # unanchored: LLM trả công thức nhưng không khớp span pdfium → bị bỏ, trang giữ text cũ
                "status": "review" if warning else ("unanchored" if result.unanchored else "ok"),
                "counts": result.counts,
                "formulas": [asdict(f) for f in result.formulas],
                "replacements": [{"source_span": a, "latex": b} for a, b in result.replacements],
            }
    return details, warnings


def _apply(extraction: ingestion.Extraction, result: page_enrichment.PageResult, warning: dict | None) -> None:
    if result.kind == "formula":
        quality = "formula_review" if warning else "formula_checked"
        for c in extraction.chunks:
            if c.locator_value == result.locator_value:
                text = page_enrichment.apply_replacements(c.text, result.replacements)
                if text != c.text:
                    c.text, c.quality = text, quality
        return
    new_chunks = ingestion.page_chunks("page", result.locator_value, result.text or "", "ocr")
    if new_chunks:
        others = [c for c in extraction.chunks if c.locator_value != result.locator_value]
        extraction.chunks = sorted(others + new_chunks, key=lambda c: c.locator_value)  # sort ổn định: giữ thứ tự trang


def main() -> None:
    parser = argparse.ArgumentParser(description="Fast pdfium parse + vision enrichment → JSON (không DB).")
    parser.add_argument("--root", default="src/data")
    parser.add_argument("--path", required=True, help="File PDF/PPTX nằm dưới --root")
    parser.add_argument("--courses", default="config/courses.yaml")
    parser.add_argument("--defaults", default="config/metadata_defaults.yaml")
    parser.add_argument("--overrides", default="config/document_overrides.yaml")
    parser.add_argument("--artifacts", default="artifacts/fast", help="Tách khỏi artifacts/ để không ghi đè MinerU")
    parser.add_argument("--no-enrich", action="store_true", help="Chỉ pdfium, không gọi vision LLM")
    args = parser.parse_args()

    record = inventory_for_path(args.root, args.path, CourseRegistry.load(args.courses))
    meta = resolve_metadata(
        record, load_course_defaults(args.defaults), load_document_overrides(args.overrides).get(record.relative_path)
    )
    version_id = meta.version.id
    content = (Path(args.root) / record.relative_path).read_bytes()

    t0 = time.perf_counter()
    extraction = ingestion.extract(content)
    t_extract = time.perf_counter() - t0
    classified = {e["locator_value"]: e["kind"] for e in extraction.enrich}

    details: dict[int, dict] = {}
    warnings = list(extraction.warnings)
    t_enrich = 0.0
    if extraction.enrich and not args.no_enrich:
        _, storage_key = storage.save_bytes(content)  # render_png đọc theo storage_key (content-addressed)
        t1 = time.perf_counter()
        details, enrich_warnings = enrich_pages(extraction, storage_key)
        t_enrich = time.perf_counter() - t1
        warnings += enrich_warnings

    loc_type = "slide" if extraction.file_type == "pptx" else "page"
    flags_by_page: dict[int, list[str]] = {}
    for w in warnings:
        flags_by_page.setdefault(w["locator_value"], []).append(w["issue"])

    def method(number: int) -> str:
        d = details.get(number)
        if d is None or d["status"] == "failed":
            return "pdfium"
        return "vision_ocr" if d["kind"] == "scan" else "pdfium+vision_formula"

    pages = []
    for number in range(1, extraction.page_count + 1):
        text = "\n".join(c.text for c in extraction.chunks if c.locator_value == number)
        pages.append(
            PageIR(
                id=f"{version_id}_p{number:04d}",
                version_id=version_id,
                locator=Locator(type=loc_type, number=number),
                raw_text=text,
                extraction_method=method(number),
                quality_flags=flags_by_page.get(number, []),
            )
        )

    chunks = [
        Chunk(
            id=f"{version_id}_c{i:04d}",
            document_id=meta.document.id,
            version_id=version_id,
            course_id=meta.document.course_id,
            document_type=meta.document.document_type,
            title=meta.document.title,
            locator=Locator(type=c.locator_type, number=c.locator_value),
            text=c.text,
            extraction_method=method(c.locator_value),
            quality_flags=[] if c.quality == "ok" else [c.quality],
            source_revision=meta.version.revision,
        )
        for i, c in enumerate(extraction.chunks)
    ]

    s = get_settings()
    report = {
        "version_id": version_id,
        "source": record.relative_path,
        "pipeline": "fast_pdfium" + ("" if args.no_enrich else "+vision_enrich"),
        "model": None if args.no_enrich else (s.vision_model or s.llm_model),
        "prompt_version": None if args.no_enrich else page_enrichment.PROMPT_VERSION,
        "timing_seconds": {"extract": round(t_extract, 2), "enrich": round(t_enrich, 2)},
        "page_count": extraction.page_count if loc_type == "page" else 0,
        "slide_count": extraction.page_count if loc_type == "slide" else 0,
        "chunk_count": len(chunks),
        "classified_pages": {str(k): v for k, v in sorted(classified.items())},
        "cleaning": extraction.cleaning,
        "warning_count": len(warnings),
        "needs_review": bool(warnings),
        "issues": sorted(warnings, key=lambda w: w["locator_value"]),
        "enrichment": {str(k): v for k, v in sorted(details.items())},
    }

    out = Path(args.artifacts)
    write_json(out / "pages" / f"{version_id}.json", [p.model_dump(mode="json") for p in pages])
    write_json(out / "chunks" / f"{version_id}.json", [c.model_dump(mode="json") for c in chunks])
    write_json(out / "quality_reports" / f"{version_id}.json", report)

    print(f"{record.relative_path}: pages={extraction.page_count} chunks={len(chunks)} "
          f"enrich_pages={len(classified)} warnings={len(warnings)} "
          f"extract={t_extract:.1f}s enrich={t_enrich:.1f}s")  # fmt: skip
    print(f"→ {out / 'chunks' / f'{version_id}.json'}")


if __name__ == "__main__":
    main()
