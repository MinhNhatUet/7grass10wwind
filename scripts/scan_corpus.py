from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.ingestion.course_registry import CourseRegistry
from src.ingestion.inventory.scanner import scan_corpus


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan a raw course corpus before parsing.")
    parser.add_argument("root", help="Raw corpus root, for example src/data")
    parser.add_argument("--courses", default="config/courses.yaml")
    parser.add_argument("--output", default="artifacts/inventory.jsonl")
    args = parser.parse_args()

    registry = CourseRegistry.load(args.courses)
    records = scan_corpus(args.root, registry)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as stream:
        for record in records:
            stream.write(json.dumps(record.model_dump(), ensure_ascii=False) + "\n")
    print(f"Wrote {len(records)} inventory records to {output}")


if __name__ == "__main__":
    main()
