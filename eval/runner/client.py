"""HTTP client theo hợp đồng PRD 11.2–11.5 và fixtures tài khoản test.

Fixtures (``data/eval/fixtures/<env>.json``, gitignored) do người dùng tự điền::

    {
      "accounts": {
        "student_course_01": {
          "login_payload": {"login_id": "$ENV:EVAL_STUDENT_01_LOGIN", "password": "$ENV:EVAL_STUDENT_01_PASSWORD"},
          "token_field": null
        }
      },
      "refs": {"courses": {"COURSE-01": "<id trên API>"}, "documents": {}, "versions": {}, "other": {}}
    }

Giá trị ``$ENV:NAME`` được đọc từ biến môi trường / ``.env``; không bao giờ in ra.
Nếu ``token_field`` có giá trị, client lấy token từ response đăng nhập và gửi header Bearer;
nếu null, phiên dựa vào cookie mà httpx tự giữ.
"""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
from dotenv import load_dotenv

from eval.common import REPO_ROOT, ConfigError, read_json, resolve
from eval.schemas import ApiConfig

ENV_PREFIX = "$ENV:"
_ROUTE_MISSING = {"Not Found", "Method Not Allowed"}


class EndpointMissingError(Exception):
    """API chưa có endpoint này (FastAPI trả {"detail": "Not Found"} / 405) → kết quả blocked."""


@dataclass
class Fixtures:
    accounts: dict[str, dict[str, Any]]
    refs: dict[str, dict[str, str]] = field(default_factory=dict)

    def account(self, name: str) -> dict[str, Any]:
        if name not in self.accounts:
            raise ConfigError(f"fixtures chưa có tài khoản '{name}'")
        return self.accounts[name]

    def ref(self, kind: str, name: str) -> str:
        """Ánh xạ tên fixture/ID trong dữ liệu → ID trên API; không có ánh xạ thì giữ nguyên."""
        return self.refs.get(kind, {}).get(name, name)

    def reverse(self, kind: str) -> dict[str, str]:
        return {v: k for k, v in self.refs.get(kind, {}).items()}


def load_fixtures(fixtures_dir: str, env: str) -> Fixtures:
    path = resolve(fixtures_dir) / f"{env}.json"
    if not path.is_file():
        raise ConfigError(
            f"Chưa có fixtures {path}. Tạo file theo mẫu trong docstring eval/runner/client.py "
            "(tài khoản test do người dùng tự điền, mật khẩu để trong .env)."
        )
    data = read_json(path)
    return Fixtures(accounts=data.get("accounts", {}), refs=data.get("refs", {}))


def _resolve_env(value: Any) -> Any:
    if isinstance(value, str) and value.startswith(ENV_PREFIX):
        name = value[len(ENV_PREFIX) :]
        if name not in os.environ:
            raise ConfigError(f"Thiếu biến môi trường {name} (điền trong .env)")
        return os.environ[name]
    if isinstance(value, dict):
        return {k: _resolve_env(v) for k, v in value.items()}
    return value


@dataclass
class ApiResponse:
    status_code: int
    body: Any
    latency_ms: float

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300


def is_route_missing(status_code: int, body: Any) -> bool:
    return status_code in (404, 405) and isinstance(body, dict) and body.get("detail") in _ROUTE_MISSING


class ApiClient:
    """Một phiên của một tài khoản. Mỗi case dùng client mới để không rò ngữ cảnh giữa các case."""

    def __init__(self, api: ApiConfig, base_url: str | None = None, timeout_s: float | None = None) -> None:
        load_dotenv(REPO_ROOT / ".env")
        self.api = api
        self.base = (base_url or api.base_url).rstrip("/") + api.prefix
        self._http = httpx.Client(timeout=timeout_s or api.timeout_s)

    def __enter__(self) -> ApiClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        check_route: bool = True,
    ) -> ApiResponse:
        """Gửi request; timeout/lỗi mạng ném httpx.TimeoutException/httpx.TransportError cho caller xử lý."""
        headers = {}
        if method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
            # PRD 11.4: mọi mutating request cần Idempotency-Key
            headers["Idempotency-Key"] = idempotency_key or str(uuid.uuid4())
        start = time.perf_counter()
        resp = self._http.request(method, self.base + path, json=json, params=params, headers=headers)
        latency_ms = (time.perf_counter() - start) * 1000
        try:
            body: Any = resp.json()
        except ValueError:
            body = resp.text
        if check_route and is_route_missing(resp.status_code, body):
            raise EndpointMissingError(f"{method.upper()} {self.api.prefix}{path}")
        return ApiResponse(resp.status_code, body, latency_ms)

    # --- nghiệp vụ (PRD 11.2) ---

    def login(self, account: dict[str, Any]) -> ApiResponse:
        payload = _resolve_env(account.get("login_payload", {}))
        resp = self.request("POST", "/auth/login", json=payload)
        token_field = account.get("token_field")
        if resp.ok and token_field and isinstance(resp.body, dict) and resp.body.get(token_field):
            self._http.headers["Authorization"] = f"Bearer {resp.body[token_field]}"
        return resp

    def create_conversation(self, course_id: str) -> tuple[ApiResponse, str | None]:
        resp = self.request("POST", "/conversations", json={"course_id": course_id})
        conv_id = None
        if resp.ok and isinstance(resp.body, dict):
            for key in self.api.contract.conversation_id_fields:
                if resp.body.get(key):
                    conv_id = str(resp.body[key])
                    break
        return resp, conv_id

    def send_message(self, conversation_id: str, content: str) -> ApiResponse:
        return self.request(
            "POST",
            f"/conversations/{conversation_id}/messages",
            json={self.api.contract.message_body_field: content},
        )

    def search_documents(self, query: str, course_id: str | None = None) -> ApiResponse:
        params: dict[str, Any] = {self.api.contract.search_query_param: query}
        if course_id:
            params["course_id"] = course_id
        return self.request("GET", "/documents", params=params)
