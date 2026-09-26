"""Kho file riêng tư (FR-06.2): lưu theo sha256 dưới data/storage (gitignored), không có URL công khai."""

from __future__ import annotations

import hashlib
from pathlib import Path

from src.db import REPO_ROOT

STORAGE_DIR = REPO_ROOT / "data" / "storage"


def save_bytes(content: bytes) -> tuple[str, str]:
    """Trả (checksum, storage_key). Cùng nội dung → cùng key, không ghi trùng."""
    checksum = hashlib.sha256(content).hexdigest()
    key = f"{checksum[:2]}/{checksum}"
    path = STORAGE_DIR / key
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(content)
        tmp.replace(path)
    return checksum, key


def path_of(storage_key: str) -> Path:
    path = (STORAGE_DIR / storage_key).resolve()
    if STORAGE_DIR.resolve() not in path.parents:
        raise ValueError("storage_key không hợp lệ")
    return path
