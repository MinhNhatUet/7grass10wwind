"""Log vận hành có cấu trúc + mã truy vết theo request (logging đợt 1).

- Mỗi HTTP request có `http_request_id` (req_…), trả qua header `X-Request-ID`; mọi log trong request (kể cả code sync
  chạy trong threadpool — anyio sao chép context) và job nền khởi tạo từ request đều mang mã này.
- Log ra stdout dạng JSON một dòng. Không ghi body, prompt, câu trả lời, đoạn tài liệu (admin không được đọc nội dung
  học tập — AC-01.6); lọc khóa/token/mật khẩu ở cả trường `extra` lẫn nội dung message.
- Chỉ dùng `logging` + `contextvars` của stdlib.
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import secrets
import sys
import time
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("http_request_id", default=None)
log = logging.getLogger("edu04.http")

_SECRET_KEY = re.compile(r"pass|token|secret|api[_-]?key|authorization|cookie", re.I)
_SECRET_VAL = re.compile(r"(Bearer\s+)[\w.\-~+/]+=*|\b(sk|AIza)[\w\-]{12,}", re.I)
_STD = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


def scrub(text: str) -> str:
    return _SECRET_VAL.sub(lambda m: (m.group(1) or "") + "[REDACTED]", text)


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str, environment: str) -> None:
        super().__init__()
        self.base = {"service": service, "environment": environment}

    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            **self.base,
            "logger": record.name,
            "event": getattr(record, "event", None) or record.name,
            "message": scrub(record.getMessage()),
        }
        if rid := request_id.get():
            out["http_request_id"] = rid
        for k, v in vars(record).items():
            if k not in _STD and k != "event":
                out[k] = "[REDACTED]" if _SECRET_KEY.search(k) else v
        if record.exc_info and record.exc_info[0]:
            out["error_type"] = record.exc_info[0].__name__  # không ghi stack/nội dung lỗi thô (có thể chứa dữ liệu)
        return json.dumps(out, ensure_ascii=False, default=str)


def configure_logging(service: str, environment: str, level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service, environment))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)


def install(app: FastAPI) -> None:
    """Middleware: sinh mã, đo thời gian, ghi một dòng log/request; lỗi không bắt được → 500 JSON có mã hỗ trợ."""

    @app.middleware("http")
    async def _trace(req: Request, call_next):  # noqa: ANN202
        rid = "req_" + secrets.token_hex(8)
        token = request_id.set(rid)
        started = time.perf_counter()
        status = 500
        try:
            resp = await call_next(req)
            status = resp.status_code
        except Exception:
            log.exception("Unhandled error", extra={"event": "http.unhandled_error", "method": req.method,
                                                    "path": req.url.path})  # fmt: skip
            resp = JSONResponse(status_code=500, content={"status": "error", "error": {
                "code": "INTERNAL_ERROR", "retryable": True, "request_id": rid}})  # fmt: skip
        finally:
            route = req.scope.get("route")
            log.log(
                logging.WARNING if status >= 500 else logging.INFO,
                "%s %s → %s",
                req.method,
                getattr(route, "path", req.url.path),
                status,
                extra={"event": "http.request", "method": req.method, "route": getattr(route, "path", None),
                       "status": status, "duration_ms": round((time.perf_counter() - started) * 1000, 1)},
            )  # fmt: skip
            request_id.reset(token)
        resp.headers["X-Request-ID"] = rid
        return resp
