from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


class MetadataConfigError(ValueError):
    """Raised when metadata configuration cannot be loaded."""


def load_yaml_mapping(path: str | Path) -> dict[str, Any]:
    config_path = Path(path)
    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise MetadataConfigError(f"Malformed YAML in {config_path}: {exc}") from exc
    except OSError as exc:
        raise MetadataConfigError(f"Cannot read metadata config {config_path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise MetadataConfigError(f"{config_path} must contain a YAML mapping")
    return raw


def load_course_defaults(path: str | Path) -> dict[str, dict[str, Any]]:
    raw = load_yaml_mapping(path)
    defaults = raw.get("course_defaults", {})
    if not isinstance(defaults, dict):
        raise MetadataConfigError("'course_defaults' must be a mapping")
    return defaults


def load_document_overrides(path: str | Path) -> dict[str, dict[str, Any]]:
    raw = load_yaml_mapping(path)
    overrides = raw.get("overrides", {})
    if not isinstance(overrides, dict):
        raise MetadataConfigError("'overrides' must be a mapping")
    return overrides
