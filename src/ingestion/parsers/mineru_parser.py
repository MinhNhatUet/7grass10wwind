from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from collections import Counter
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from src.ingestion.models.element import Element, ElementType
from src.ingestion.models.page import Locator, PageIR, ParsedDocument
from src.ingestion.parsers.base import BaseParser, ParserDependencyError
from src.ingestion.quality.flags import QualityFlag
from src.ingestion.quality.text_quality import contains_unsafe_control_chars, replace_unsafe_control_chars

MINERU_SUPPORTED_MIME = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "image/png",
    "image/jpeg",
}


class MinerUParser(BaseParser):
    def __init__(
        self,
        artifact_root: str | Path = "artifacts",
        tier: str = "standard",
        timeout_seconds: int = 1800,
        device: str = "auto",
    ):
        self.artifact_root = Path(artifact_root)
        self.tier = tier
        self.timeout_seconds = timeout_seconds
        self.device = device

    def can_handle(self, mime_type: str) -> bool:
        return mime_type in MINERU_SUPPORTED_MIME and self._command() is not None

    def parse(self, file_path: str | Path, version_id: str) -> ParsedDocument:
        command = self._command()
        if command is None:
            raise ParserDependencyError("MinerU CLI is not installed. Install mineru>=4.0,<5.")

        input_path = Path(file_path)
        output_dir = self.artifact_root / "mineru" / version_id
        output_dir.mkdir(parents=True, exist_ok=True)
        tier = _tier_for_file(input_path, self.tier)
        if command == "mineru-kit":
            args = [command, "parse", str(input_path), "-o", str(output_dir), "--format", "middle_json", "--tier", tier]
        else:
            args = [command, "parse", str(input_path), "--pages", "all", "-o", str(output_dir / "markdown.md")]

        completed = subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
            env=_subprocess_env(self.device),
        )
        if completed.returncode != 0:
            raise ParserDependencyError(
                f"MinerU parse failed for {input_path}: {completed.stderr.strip() or completed.stdout.strip()}"
            )

        middle_json = _find_first(output_dir, ["*middle*.json", "middle_json.json", "*.json"])
        if middle_json:
            pages = _pages_from_mineru_json(json.loads(middle_json.read_text(encoding="utf-8")), version_id)
        else:
            markdown = _find_first(output_dir, ["*.md", "markdown.md"])
            if not markdown:
                raise ParserDependencyError(f"MinerU parse produced no readable output in {output_dir}")
            pages = _pages_from_markdown(markdown.read_text(encoding="utf-8"), version_id)

        return ParsedDocument(version_id=version_id, pages=pages, native_result=pages, selected_result=pages)

    @staticmethod
    def _command() -> str | None:
        if shutil.which("mineru-kit"):
            return "mineru-kit"
        if shutil.which("mineru"):
            return "mineru"
        return None


def _find_first(root: Path, patterns: list[str]) -> Path | None:
    for pattern in patterns:
        matches = sorted(root.rglob(pattern))
        if matches:
            return matches[0]
    return None


def _tier_for_file(path: Path, configured_tier: str) -> str:
    suffix = path.suffix.lower()
    if suffix in {".pdf", ".png", ".jpg", ".jpeg"}:
        return configured_tier
    return "flash"


def _subprocess_env(device: str) -> dict[str, str]:
    env = os.environ.copy()
    normalized = device.lower()
    if normalized == "cpu":
        env["CUDA_VISIBLE_DEVICES"] = "-1"
        env["MINERU_DEVICE"] = "cpu"
    elif normalized in {"gpu", "cuda"}:
        env.setdefault("CUDA_VISIBLE_DEVICES", "0")
        env["MINERU_DEVICE"] = "cuda"
    return env


def _pages_from_markdown(markdown: str, version_id: str) -> list[PageIR]:
    text = _sanitize_text(markdown)
    flags = [QualityFlag.CHUNK_CONTAINS_CONTROL_CHAR.value] if text != markdown else []
    return [
        PageIR(
            id=f"{version_id}_page_001",
            version_id=version_id,
            locator=Locator(type="page", number=1),
            raw_text=text,
            elements=[
                Element(
                    id=f"{version_id}_page_001_el_001",
                    type=ElementType.TEXT,
                    order=1,
                    source="mineru_markdown",
                    text=text,
                    quality_flags=flags,
                )
            ],
            extraction_method="mineru_markdown",
            quality_flags=flags,
        )
    ]


def _pages_from_mineru_json(payload: dict[str, Any], version_id: str) -> list[PageIR]:
    pages_payload = payload.get("pages") or payload.get("pdf_info") or []
    repeated_margin_texts = _find_repeated_margin_texts(pages_payload)
    pages: list[PageIR] = []
    for page_index, page_payload in enumerate(pages_payload, start=1):
        page_number = int(page_payload.get("page_idx", page_payload.get("page_id", page_index - 1))) + 1
        blocks = page_payload.get("blocks") or page_payload.get("para_blocks") or []
        elements: list[Element] = []
        page_flags: set[str] = set()
        for order, block in enumerate(blocks, start=1):
            if _normalized_text(_extract_text(block)) in repeated_margin_texts:
                continue
            element = _element_from_block(block, version_id, page_number, order, repeated_margin_texts)
            if element:
                page_flags.update(element.quality_flags)
                elements.append(element)
        raw_text = "\n".join(_element_semantic_text(element) for element in elements if _element_semantic_text(element))
        pages.append(
            PageIR(
                id=f"{version_id}_page_{page_number:03d}",
                version_id=version_id,
                locator=Locator(type="page", number=page_number),
                width=_as_float(page_payload.get("width")),
                height=_as_float(page_payload.get("height")),
                raw_text=raw_text,
                elements=elements,
                extraction_method="mineru_middle_json",
                quality_flags=sorted(page_flags),
            )
        )
    if not pages:
        return _pages_from_markdown(json.dumps(payload, ensure_ascii=False), version_id)
    return pages


def _element_from_block(
    block: dict[str, Any],
    version_id: str,
    page_number: int,
    order: int,
    repeated_margin_texts: set[str] | None = None,
) -> Element | None:
    block_type = str(block.get("type") or block.get("block_type") or "text").lower()
    extracted_text = _extract_text(block)
    text = _sanitize_text(_remove_repeated_text(extracted_text, repeated_margin_texts or set()))
    flags = [QualityFlag.CHUNK_CONTAINS_CONTROL_CHAR.value] if contains_unsafe_control_chars(extracted_text) else []
    bbox = _normalize_bbox(block.get("bbox") or block.get("bounding_box"))
    element_id = f"{version_id}_page_{page_number:03d}_mineru_{order:04d}"

    if block_type in {"header", "footer", "page_number"}:
        return None
    if block_type in {"doc_title", "paragraph_title", "title", "section_title"} and _is_probable_heading(
        text, block_type
    ):
        if not text:
            return None
        default_level = 1 if block_type == "doc_title" else 2
        return Element(
            id=element_id,
            type=ElementType.TITLE,
            bbox=bbox,
            order=order,
            heading_level=_as_int(block.get("level"), default_level),
            source="mineru",
            text=text,
            page_number=page_number,
            quality_flags=flags,
        )
    if "formula" in block_type or "equation" in block_type:
        return Element(
            id=element_id,
            type=ElementType.FORMULA,
            bbox=bbox,
            order=order,
            source="mineru",
            latex=text or None,
            page_number=page_number,
            model_name="MinerU",
            recognition_method="mineru",
            verified=False,
            needs_review=not bool(text),
            quality_flags=[] if text else [QualityFlag.FORMULA_UNREADABLE.value],
        )
    if "table" in block_type:
        rows = _html_table_rows(text)
        return Element(
            id=element_id,
            type=ElementType.TABLE,
            bbox=bbox,
            order=order,
            source="mineru",
            text=text,
            rows=rows,
            page_number=page_number,
            quality_flags=flags,
        )
    if any(kind in block_type for kind in ("image", "figure", "chart")):
        return Element(
            id=element_id,
            type=ElementType.FIGURE,
            bbox=bbox,
            order=order,
            source="mineru",
            caption=text or None,
            page_number=page_number,
            quality_flags=flags or [QualityFlag.VISUAL_CONTENT.value],
        )
    if not text:
        return None
    return Element(
        id=element_id,
        type=ElementType.TEXT,
        bbox=bbox,
        order=order,
        source="mineru",
        text=text,
        page_number=page_number,
        quality_flags=flags,
    )


def _extract_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(part for part in (_extract_text(item) for item in value) if part)
    if isinstance(value, dict):
        has_semantic_key = False
        for key in ("latex", "text", "content", "html", "markdown"):
            if key in value:
                has_semantic_key = True
                text = _extract_text(value[key])
                if text:
                    return text
        if has_semantic_key:
            return ""
        ignored = {"type", "index", "bbox", "bounding_box", "styles", "level", "sub_type", "guess_lang"}
        return "\n".join(
            part for key, item in value.items() if key not in ignored for part in [_extract_text(item)] if part
        )
    return str(value)


def _sanitize_text(text: str) -> str:
    return replace_unsafe_control_chars(text) if contains_unsafe_control_chars(text) else text


def _element_semantic_text(element: Element) -> str:
    if element.type == ElementType.FORMULA:
        return element.latex or ""
    if element.type == ElementType.TABLE:
        return element.text or ""
    if element.type in {ElementType.FIGURE, ElementType.IMAGE, ElementType.CHART}:
        return element.caption or ""
    return element.text or ""


def _normalize_bbox(value: Any) -> list[float] | None:
    if not isinstance(value, list) or len(value) != 4:
        return None
    try:
        return [float(item) for item in value]
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
        return parsed if parsed >= 1 else default
    except (TypeError, ValueError):
        return default


def _normalized_text(value: str) -> str:
    return " ".join(value.casefold().split())


def _remove_repeated_text(value: str, repeated_texts: set[str]) -> str:
    cleaned = value
    for repeated in sorted(repeated_texts, key=len, reverse=True):
        pattern = r"\s*".join(re.escape(part) for part in repeated.split())
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)
    return "\n".join(line.strip() for line in cleaned.splitlines() if line.strip())


def _is_probable_heading(text: str, block_type: str) -> bool:
    stripped = text.strip()
    if not stripped or len(stripped) > 240:
        return False
    if block_type == "doc_title":
        return True
    return not stripped.startswith(("•", "-", "–", "—", "§", "◼", "▪", "▫"))


def _find_repeated_margin_texts(pages_payload: list[dict[str, Any]]) -> set[str]:
    """Detect headers/footers mislabeled as ordinary text by MinerU."""
    counts: Counter[str] = Counter()
    for page in pages_payload:
        blocks = page.get("blocks") or page.get("para_blocks") or []
        seen_on_page: set[str] = set()
        for block in blocks:
            bbox = _normalize_bbox(block.get("bbox") or block.get("bounding_box"))
            if bbox is None or not all(0.0 <= coordinate <= 1.0 for coordinate in bbox):
                continue
            if bbox[1] > 0.12 and bbox[3] < 0.88:
                continue
            text = _normalized_text(_extract_text(block))
            if 10 <= len(text) <= 200:
                seen_on_page.add(text)
        counts.update(seen_on_page)
    minimum = max(3, (len(pages_payload) + 2) // 3)
    return {text for text, count in counts.items() if count >= minimum}


class _TableHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] = []
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        if tag in {"td", "th"}:
            self._cell = []
        elif tag == "br" and self._cell is not None:
            self._cell.append("\n")

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._cell is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row:
            self.rows.append(self._row)
            self._row = []


def _html_table_rows(value: str) -> list[list[str]]:
    if "<table" not in value.casefold():
        return []
    parser = _TableHTMLParser()
    try:
        parser.feed(unescape(value))
        parser.close()
    except Exception:
        return []
    return parser.rows
