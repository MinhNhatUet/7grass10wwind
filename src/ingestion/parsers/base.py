from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from src.ingestion.models.page import ParsedDocument


class ParserDependencyError(RuntimeError):
    """Raised when an optional parser dependency is not installed."""


class BaseParser(ABC):
    @abstractmethod
    def can_handle(self, mime_type: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def parse(self, file_path: str | Path, version_id: str) -> ParsedDocument:
        raise NotImplementedError
