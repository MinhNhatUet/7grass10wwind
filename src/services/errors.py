"""Lỗi kỹ thuật theo PRD 11.4 — handler trong main.py trả {"status":"error","error":{"code","retryable"}}."""

from __future__ import annotations


class AppError(Exception):
    def __init__(self, code: str, http_status: int, retryable: bool = False, message: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.http_status = http_status
        self.retryable = retryable
        self.message = message


def not_found() -> AppError:
    # 404 cho cả "không tồn tại" và "không có quyền" để không lộ sự tồn tại (FR-05 ngoại lệ, BR-10)
    return AppError("NOT_FOUND", 404)


def forbidden(code: str = "FORBIDDEN") -> AppError:
    return AppError(code, 403)


def conflict(code: str) -> AppError:
    return AppError(code, 409)


def bad_request(code: str, message: str | None = None) -> AppError:
    return AppError(code, 422, message=message)
