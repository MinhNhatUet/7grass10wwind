"""Ánh xạ action trong SafetyCase → endpoint PRD 11.2 (BL-28).

Chỉ có các endpoint đã liệt kê trong PRD 11.2. Tham số trong ``args``:
- ``<tên>_ref``: tên fixture, được ánh xạ sang ID thật qua ``fixtures.refs`` (xem REF_KINDS);
- chuỗi ``$prev.<đường.dẫn>`` hoặc ``$step<N>.<đường.dẫn>`` (N bắt đầu từ 1): lấy từ body của bước trước;
- ``body``: JSON gửi kèm (mutating request); ``params``: query string;
- ``idempotency_key``: cố định key để kiểm tra PRD 11.4 (cùng key + cùng/khác body).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from eval.runner.client import ApiClient, ApiResponse, Fixtures

# action → (method, path template). Placeholder {x} lấy từ args["x"] hoặc args["x_ref"].
ACTIONS: dict[str, tuple[str, str]] = {
    "me": ("GET", "/me"),
    "my_courses": ("GET", "/me/courses"),
    "logout": ("POST", "/auth/logout"),
    "create_conversation": ("POST", "/conversations"),
    "send_message": ("POST", "/conversations/{conversation}/messages"),
    "list_conversations": ("GET", "/conversations"),
    "get_conversation": ("GET", "/conversations/{conversation}"),
    "list_messages": ("GET", "/conversations/{conversation}/messages"),
    "delete_conversation": ("DELETE", "/conversations/{conversation}"),
    "list_documents": ("GET", "/documents"),
    "citation_source": ("GET", "/citations/{citation}/source"),
    "download": ("GET", "/documents/{document}/versions/{version}/download"),
    "create_document": ("POST", "/documents"),
    "create_version": ("POST", "/documents/{document}/versions"),
    "job_status": ("GET", "/jobs/{job}"),
    "preview": ("GET", "/review/versions/{version}/preview"),
    "submit_version": ("POST", "/versions/{version}/submit"),
    "decision": ("POST", "/versions/{version}/decision"),
    "withdraw": ("POST", "/versions/{version}/withdraw"),
    "feedback": ("POST", "/answers/{answer}/feedback"),
    "metrics": ("GET", "/metrics"),
}

# Tên placeholder → nhóm trong fixtures.refs
REF_KINDS = {
    "course": "courses",
    "conversation": "other",
    "citation": "other",
    "document": "documents",
    "version": "versions",
    "job": "other",
    "answer": "other",
}


class ActionError(Exception):
    """Case khai báo action/tham số sai (lỗi dữ liệu, không phải lỗi hệ thống)."""


@dataclass
class StepContext:
    fixtures: Fixtures
    bodies: list[Any]  # body của các bước đã chạy, theo thứ tự


def _lookup(body: Any, dotted: str) -> Any:
    cur = body
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
            cur = cur[int(part)]
        else:
            raise ActionError(f"không lấy được '{dotted}' từ response bước trước")
    return cur


def resolve_value(value: Any, ctx: StepContext, key: str = "") -> Any:
    if isinstance(value, str):
        if value.startswith("$prev."):
            if not ctx.bodies:
                raise ActionError("$prev dùng ở bước đầu tiên")
            return _lookup(ctx.bodies[-1], value[len("$prev.") :])
        if value.startswith("$step"):
            head, _, dotted = value[1:].partition(".")
            idx = int(head[len("step") :]) - 1
            if not 0 <= idx < len(ctx.bodies):
                raise ActionError(f"{value}: bước {idx + 1} chưa chạy")
            return _lookup(ctx.bodies[idx], dotted)
        if key.endswith("_ref"):
            kind = REF_KINDS.get(key[: -len("_ref")], "other")
            return ctx.fixtures.ref(kind, value)
        return value
    if isinstance(value, dict):
        return {k: resolve_value(v, ctx, k) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_value(v, ctx) for v in value]
    return value


def perform(client: ApiClient, action: str, args: dict[str, Any], ctx: StepContext) -> ApiResponse:
    if action not in ACTIONS:
        raise ActionError(f"action '{action}' không có trong PRD 11.2 (xem eval/runner/actions.py)")
    method, template = ACTIONS[action]
    resolved = resolve_value(args, ctx)
    path_params = {}
    for name in REF_KINDS:
        if "{" + name + "}" in template:
            val = resolved.get(name, resolved.get(f"{name}_ref"))
            if val is None:
                raise ActionError(f"action '{action}' cần tham số '{name}' hoặc '{name}_ref'")
            path_params[name] = val
    path = template.format(**path_params)
    params = dict(resolved.get("params") or {})
    if "course_ref" in args and action == "list_documents":
        params.setdefault("course_id", resolved["course_ref"])
    body = resolved.get("body")
    if action == "create_conversation" and body is None and "course_ref" in args:
        body = {"course_id": resolved["course_ref"]}
    if action == "send_message" and body is None and "content" in resolved:
        body = {client.api.contract.message_body_field: resolved["content"]}
    return client.request(
        method, path, json=body, params=params or None, idempotency_key=resolved.get("idempotency_key")
    )
