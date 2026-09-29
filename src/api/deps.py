"""Dependency dùng chung: DB session, người dùng hiện tại (BR-02), idempotency (PRD 11.4)."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from typing import Any

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db import get_db
from src.models.orm import IdempotencyRecord, User
from src.services.auth import AuthError, AuthService, get_auth_service
from src.services.auth import Session as AuthSession
from src.services.errors import AppError

_bearer = HTTPBearer(auto_error=False)


def bearer_token(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise AuthError("UNAUTHENTICATED", 401)
    return credentials.credentials


def current_session(
    token: str = Depends(bearer_token),
    db: Session = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
) -> tuple[User, AuthSession]:
    return auth.current(db, token)


def current_user(current: tuple[User, AuthSession] = Depends(current_session)) -> User:
    """Backend tự xác định người dùng từ token; không tin role/user_id client gửi (BR-02)."""
    return current[0]


def require_role(*roles: str) -> Callable[[User], User]:
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise AppError("FORBIDDEN", 403)
        return user

    return dep


class Idempotency:
    """PRD 11.4: cùng key + cùng hash → trả lại response cũ; cùng key + khác hash → 409."""

    def __init__(self, db: Session, user: User, endpoint: str, key: str | None, payload: Any) -> None:
        self.db, self.user, self.endpoint, self.key = db, user, endpoint, key
        self.hash = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()

    def replay(self) -> Any | None:
        if not self.key:
            return None
        rec = self.db.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.user_id == self.user.id,
                IdempotencyRecord.endpoint == self.endpoint,
                IdempotencyRecord.key == self.key,
            )
        )
        if rec is None:
            return None
        if rec.request_hash != self.hash:
            raise AppError("IDEMPOTENCY_KEY_REUSED", 409)
        return rec.response

    def store(self, response: Any, status_code: int = 200) -> None:
        if not self.key:
            return
        self.db.add(
            IdempotencyRecord(
                user_id=self.user.id,
                endpoint=self.endpoint,
                key=self.key,
                request_hash=self.hash,
                status_code=status_code,
                response=response,
            )
        )


def idempotency_key(key: str | None = Header(default=None, alias="Idempotency-Key")) -> str | None:
    return key[:200] if key else None
