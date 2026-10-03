from __future__ import annotations

import mimetypes
from pathlib import Path

PDF_SIGNATURE = b"%PDF"
ZIP_SIGNATURE = b"PK\x03\x04"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURES = (b"\xff\xd8\xff\xe0", b"\xff\xd8\xff\xe1", b"\xff\xd8\xff\xdb")


def detect_mime_type(path: str | Path) -> tuple[str, list[str]]:
    file_path = Path(path)
    warnings: list[str] = []
    extension_mime = mimetypes.guess_type(file_path.name)[0]

    with file_path.open("rb") as stream:
        signature = stream.read(8)

    if signature.startswith(PDF_SIGNATURE):
        detected = "application/pdf"
    elif signature.startswith(ZIP_SIGNATURE) and file_path.suffix.lower() == ".pptx":
        detected = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    elif signature.startswith(PNG_SIGNATURE):
        detected = "image/png"
    elif any(signature.startswith(candidate) for candidate in JPEG_SIGNATURES):
        detected = "image/jpeg"
    elif file_path.suffix.lower() in {".ppt"}:
        detected = "application/vnd.ms-powerpoint"
    else:
        detected = extension_mime or "application/octet-stream"

    if extension_mime and detected != extension_mime:
        warnings.append(f"mime_extension_mismatch:{extension_mime}->{detected}")
    return detected, warnings


def is_supported_mime(mime_type: str) -> bool:
    return mime_type in {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "image/png",
        "image/jpeg",
    }
