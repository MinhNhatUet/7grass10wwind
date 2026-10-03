from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.ingestion.inventory.scanner import InventoryRecord
from src.ingestion.metadata.loader import load_course_defaults, load_document_overrides
from src.ingestion.metadata.resolver import resolve_metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Resolve ingestion metadata from inventory.")
    parser.add_argument("inventory", help="Path to artifacts/inventory.jsonl")
    parser.add_argument("--defaults", default="config/metadata_defaults.yaml")
    parser.add_argument("--overrides", default="config/document_overrides.yaml")
    parser.add_argument("--output", default="artifacts/resolved_metadata.jsonl")
    parser.add_argument("--review-output", default="artifacts/metadata_review.jsonl")
    args = parser.parse_args()

    defaults = load_course_defaults(args.defaults)
    overrides = load_document_overrides(args.overrides)
    resolved_output = Path(args.output)
    review_output = Path(args.review_output)
    resolved_output.parent.mkdir(parents=True, exist_ok=True)

    resolved_count = 0
    review_count = 0
    with Path(args.inventory).open("r", encoding="utf-8") as inventory_stream, resolved_output.open(
        "w", encoding="utf-8"
    ) as resolved_stream, review_output.open("w", encoding="utf-8") as review_stream:
        for line in inventory_stream:
            record = InventoryRecord.model_validate_json(line)
            metadata = resolve_metadata(record, defaults, overrides.get(record.relative_path))
            resolved_stream.write(json.dumps(metadata.model_dump(mode="json", by_alias=True), ensure_ascii=False) + "\n")
            resolved_count += 1
            if metadata.metadata_status == "needs_review":
                review_stream.write(
                    json.dumps(
                        {
                            "relative_path": record.relative_path,
                            "missing_required_fields": metadata.missing_required_fields,
                            "warnings": metadata.metadata_warnings,
                            "suggestions": {
                                key: value.model_dump() for key, value in metadata.suggestions.items()
                            },
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                review_count += 1
    print(f"Wrote {resolved_count} metadata records; {review_count} need review")


if __name__ == "__main__":
    main()
