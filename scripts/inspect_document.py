from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect a resolved ingestion artifact by version id.")
    parser.add_argument("version_id")
    parser.add_argument("--metadata", default="artifacts/resolved_metadata.jsonl")
    parser.add_argument("--chunks", default=None)
    args = parser.parse_args()

    found = False
    metadata_path = Path(args.metadata)
    if metadata_path.exists():
        for line in metadata_path.read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            if record["version"]["id"] == args.version_id:
                found = True
                print(f"Original file: {record['version']['storage_key']}")
                print(f"Document     : {record['document']['title']}")
                print(f"Course       : {record['document']['course_id']}")
                print(f"State        : {record['version']['state']}")
                print(f"ACL roles    : {', '.join(record['acl']['allowed_roles']) or '[deny by default]'}")
                print(f"Integrity    : {record['integrity']['type']}")
                print(f"Warnings     : {', '.join(record['metadata_warnings']) or '[none]'}")
                break
    if not found:
        raise SystemExit(f"Version not found in {metadata_path}: {args.version_id}")


if __name__ == "__main__":
    main()
