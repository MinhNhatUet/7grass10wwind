"""Tiện ích dùng chung: đọc config, manifest, JSONL, checksum, exit code.

Mọi tham số (đường dẫn, phân bổ môn, ngưỡng) đọc từ ``eval/config.json`` để khi đổi
môn/dữ liệu chỉ phải sửa config, không sửa code (plans/README mục 0, MVP-2).
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from eval.schemas import EvalConfig, Manifest

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = REPO_ROOT / "eval" / "config.json"

EXIT_OK = 0
EXIT_DATA_ERROR = 1
EXIT_CONFIG_ERROR = 2
EXIT_BLOCKED = 3


class ConfigError(Exception):
    """Config hoặc file đầu vào không đọc được/không hợp lệ (exit 2)."""


def setup_console() -> None:
    """Ép stdout/stderr sang UTF-8 (Windows mặc định cp1258 làm lỗi tiếng Việt)."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")


def resolve(path: str | Path) -> Path:
    """Đường dẫn tương đối được hiểu là tính từ gốc repo."""
    p = Path(path)
    return p if p.is_absolute() else REPO_ROOT / p


def read_json(path: str | Path) -> Any:
    p = resolve(path)
    if not p.is_file():
        raise ConfigError(f"Không tìm thấy file: {p}")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ConfigError(f"JSON không hợp lệ ở {p}: {e}") from e


def write_json(path: str | Path, data: Any) -> Path:
    p = resolve(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, BaseModel):
        data = data.model_dump(mode="json")
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return p


def load_config(path: str | Path = CONFIG_PATH) -> EvalConfig:
    try:
        return EvalConfig.model_validate(read_json(path))
    except ValueError as e:
        raise ConfigError(f"Config không hợp lệ ({path}): {e}") from e


def load_manifest(config: EvalConfig, path: str | Path | None = None) -> Manifest:
    """Đọc manifest và kiểm tra phân bổ holdout trong config khớp danh sách môn."""
    manifest_path = path or config.manifest_path
    try:
        manifest = Manifest.model_validate(read_json(manifest_path))
    except ValueError as e:
        raise ConfigError(f"Manifest không đúng cấu trúc ({manifest_path}): {e}") from e
    course_ids = {c.course_id for c in manifest.courses}
    unknown = set(config.holdout.course_allocation) - course_ids
    if unknown:
        raise ConfigError(f"config.holdout.course_allocation có môn không có trong manifest: {sorted(unknown)}")
    return manifest


def iter_jsonl(path: str | Path) -> Iterator[tuple[int, dict[str, Any]]]:
    """Trả về (số dòng, object). Dòng trống bị bỏ qua; dòng lỗi JSON ném ValueError kèm số dòng."""
    p = resolve(path)
    if not p.is_file():
        raise ConfigError(f"Không tìm thấy file: {p}")
    with p.open(encoding="utf-8") as f:
        for lineno, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise ValueError(f"dòng {lineno}: JSON không hợp lệ ({e})") from e
            if not isinstance(obj, dict):
                raise ValueError(f"dòng {lineno}: mỗi dòng phải là một object JSON")
            yield lineno, obj


def write_jsonl(path: str | Path, rows: Iterable[BaseModel | dict[str, Any]], append: bool = False) -> Path:
    p = resolve(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a" if append else "w", encoding="utf-8") as f:
        for row in rows:
            data = row.model_dump(mode="json") if isinstance(row, BaseModel) else row
            f.write(json.dumps(data, ensure_ascii=False) + "\n")
    return p


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with resolve(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def rel(path: Path) -> str:
    """Đường dẫn tương đối so với gốc repo (dùng khi in/ghi báo cáo)."""
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def new_run_id(label: str) -> str:
    return f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{label}"


def git_commit() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=True
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout.strip() or None


def run_dir(config: EvalConfig, run_id: str) -> Path:
    return resolve(config.runs_dir) / run_id


def percentile(values: list[float], pct: float) -> float | None:
    """Percentile theo nearest-rank (không nội suy) — dùng cho p50/p95."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, -(-len(ordered) * pct // 100))  # ceil
    return ordered[int(rank) - 1]
