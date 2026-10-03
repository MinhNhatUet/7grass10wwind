"""Đăng nhập tối giản cho MVP (UC-09; PRD 9.1, 11.2; BR-02).

- Mật khẩu lưu dạng hash scrypt có salt trong bảng users (PRD 9.1: không lưu mật khẩu thô).
- Phiên trong bộ nhớ, chỉ lưu sha256 của token; mất khi restart (giới hạn MVP).
- Mỗi request đọc lại user từ DB: khóa tài khoản có hiệu lực ngay trên phiên (PRD 9.1).
- Đếm đăng nhập sai theo (login_id, IP) → 429; thông báo không phân biệt "không có tài khoản"/"sai mật khẩu".
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from src.config import get_settings
from src.models.orm import User
from src.services.errors import AppError

SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN = 2**14, 8, 1, 32


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_DKLEN)
    b64 = base64.b64encode
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${b64(salt).decode()}${b64(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt_b64), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)


# Hash giả để thời gian xử lý như nhau khi login_id không tồn tại (không lộ tài khoản)
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


class AuthError(AppError):
    """Giữ tên cũ cho mã lỗi xác thực."""


@dataclass
class Session:
    user_id: str
    expires_at: datetime


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _key(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def create(self, user_id: str, ttl: timedelta) -> tuple[str, Session]:
        token = secrets.token_urlsafe(32)
        session = Session(user_id=user_id, expires_at=datetime.now(UTC) + ttl)
        now = datetime.now(UTC)
        with self._lock:
            # Dọn phiên hết hạn mỗi lần đăng nhập: phiên của người đóng trình duyệt không đăng xuất không tích lũy mãi
            for key in [k for k, s in self._sessions.items() if s.expires_at <= now]:
                del self._sessions[key]
            self._sessions[self._key(token)] = session
        return token, session

    def get(self, token: str) -> Session | None:
        with self._lock:
            session = self._sessions.get(self._key(token))
            if session and session.expires_at <= datetime.now(UTC):
                del self._sessions[self._key(token)]
                return None
            return session

    def revoke(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(self._key(token), None)

    def revoke_user(self, user_id: str) -> None:
        with self._lock:
            for key in [k for k, s in self._sessions.items() if s.user_id == user_id]:
                del self._sessions[key]


class LoginRateLimiter:
    def __init__(self, max_failures: int, window_s: int) -> None:
        self.max_failures = max_failures
        self.window_s = window_s
        self._failures: dict[tuple[str, str], deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: tuple[str, str], now: float) -> deque[float]:
        q = self._failures.get(key, deque())
        while q and now - q[0] > self.window_s:
            q.popleft()
        if not q:
            self._failures.pop(key, None)  # không giữ khóa rỗng (login_id ngẫu nhiên không làm phình bộ nhớ)
        return q

    def blocked(self, key: tuple[str, str]) -> bool:
        with self._lock:
            return len(self._prune(key, time.monotonic())) >= self.max_failures

    def fail(self, key: tuple[str, str]) -> None:
        with self._lock:
            now = time.monotonic()
            for stale in [k for k, q in self._failures.items() if not q or now - q[-1] > self.window_s]:
                del self._failures[stale]  # dọn khóa đã quá cửa sổ
            q = self._prune(key, now)
            q.append(now)
            self._failures[key] = q

    def reset(self, key: tuple[str, str]) -> None:
        with self._lock:
            self._failures.pop(key, None)


class AuthService:
    def __init__(self, ttl: timedelta, limiter: LoginRateLimiter) -> None:
        self.sessions = SessionStore()
        self.ttl = ttl
        self.limiter = limiter

    def login(self, db: DbSession, login_id: str, password: str, client_ip: str) -> tuple[str, Session, User]:
        key = (login_id.casefold(), client_ip)
        if self.limiter.blocked(key):
            raise AuthError("TOO_MANY_LOGIN_ATTEMPTS", 429, retryable=True)
        user = db.scalar(select(User).where(func.lower(User.login_id) == login_id.casefold()))
        ok = verify_password(password, user.password_hash if user else _DUMMY_HASH)
        if not (user and ok and user.status == "active"):
            self.limiter.fail(key)
            raise AuthError("INVALID_CREDENTIALS", 401)
        self.limiter.reset(key)
        token, session = self.sessions.create(user.id, self.ttl)
        return token, session, user

    def current(self, db: DbSession, token: str) -> tuple[User, Session]:
        session = self.sessions.get(token)
        if session is None:
            raise AuthError("UNAUTHENTICATED", 401)
        user = db.get(User, session.user_id)
        if user is None or user.status != "active":
            self.sessions.revoke(token)
            raise AuthError("UNAUTHENTICATED", 401)
        return user, session

    def logout(self, token: str) -> None:
        self.sessions.revoke(token)


@lru_cache
def get_auth_service() -> AuthService:
    settings = get_settings()
    return AuthService(
        ttl=timedelta(minutes=settings.auth_session_ttl_minutes),
        limiter=LoginRateLimiter(settings.auth_max_failed_logins, settings.auth_failed_window_seconds),
    )
