from __future__ import annotations

from pathlib import Path


class RenderingUnavailableError(RuntimeError):
    """Raised when slide/page rendering requires a runtime not installed."""


class Renderer:
    def render(self, file_path: str | Path, output_dir: str | Path) -> list[Path]:
        raise RenderingUnavailableError(
            "Rendering is not configured. Install/configure a PDF or presentation renderer such as LibreOffice."
        )
