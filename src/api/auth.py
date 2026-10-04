from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.deps import bearer_token, current_session, current_user
from src.config import get_settings
from src.db import get_db
from src.models.orm import Course, User
from src.models.schemas import (
    CourseItem,
    CoursesResponse,
    LoginRequest,
    LoginResponse,
    MeResponse,
    RegisterRequest,
    SessionInfo,
    UserPublic,
)
from src.services import acl, audit
from src.services.auth import AuthService, LoginRateLimiter, get_auth_service, hash_password
from src.services.auth import Session as AuthSession
from src.services.errors import AppError

router = APIRouter()
# Đăng ký tự do chỉ tạo SV chưa có môn, nhưng vẫn giới hạn theo IP để không tạo tài khoản hàng loạt (H-06)
_register_limiter = LoginRateLimiter(max_failures=get_settings().auth_max_registrations_per_hour, window_s=3600)


def public_user(user: User) -> UserPublic:
    return UserPublic(id=user.id, login_id=user.login_id, display_name=user.display_name, role=user.role)


@router.post("/auth/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    client_ip = request.client.host if request.client else "unknown"
    token, session, user = auth.login(db, body.login_id, body.password, client_ip)
    expires_in = int((session.expires_at - datetime.now(UTC)).total_seconds())
    return LoginResponse(access_token=token, expires_in=expires_in, user=public_user(user))


class DemoLogin(BaseModel):
    # Không có admin: quản trị có quyền bật/tắt và đổi quyền hệ thống — không cho vào bằng nút demo không mật khẩu
    role: Literal["student", "lecturer"]


@router.get("/auth/demo-login")
async def demo_login_status() -> dict[str, bool]:
    """Frontend hỏi để biết có hiện nút "Đăng nhập demo" không."""
    s = get_settings()
    return {"enabled": s.demo_login_enabled and s.app_env != "production"}


@router.post("/auth/demo-login", response_model=LoginResponse)
def demo_login(
    body: DemoLogin,
    db: Session = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    """D-71: đăng nhập nhanh bằng tài khoản demo theo vai trò — mật khẩu không bao giờ xuống frontend. Chỉ hoạt động
    khi DEMO_LOGIN_ENABLED=true và không phải production; tắt thì 404 (không lộ sự tồn tại). Có ghi audit."""
    s = get_settings()
    if not (s.demo_login_enabled and s.app_env != "production"):
        raise AppError("NOT_FOUND", 404)
    login_id = {"student": s.demo_cnpm_sinhvien_login, "lecturer": s.demo_cnpm_giangvien_login}[body.role]
    user = db.scalar(select(User).where(User.login_id == login_id))
    if user is None or user.status != "active" or user.role != body.role:
        raise AppError("DEMO_ACCOUNT_UNAVAILABLE", 404, message="Chưa có tài khoản demo cho vai trò này.")
    token, session = auth.sessions.create(user.id, auth.ttl)
    audit.record(db, actor_id=user.id, action="demo_login", object_type="user", object_id=user.id)
    db.commit()
    expires_in = int((session.expires_at - datetime.now(UTC)).total_seconds())
    return LoginResponse(access_token=token, expires_in=expires_in, user=public_user(user))


@router.post("/auth/register", response_model=LoginResponse)
def register(
    body: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    client_ip = request.client.host if request.client else "unknown"
    if _register_limiter.blocked(("register", client_ip)):
        raise AppError("TOO_MANY_REGISTRATIONS", 429, retryable=True)
    _register_limiter.fail(("register", client_ip))  # đếm mọi lần thử, kể cả trùng tài khoản

    # So không phân biệt hoa/thường như lúc đăng nhập: "SinhVien" trùng "sinhvien" (BR-02)
    if db.scalar(select(User).where(func.lower(User.login_id) == body.login_id.casefold())):
        raise HTTPException(400, "Tài khoản đã tồn tại")

    user = User(
        login_id=body.login_id,
        display_name=body.display_name or body.login_id.split("@")[0],
        role="student",  # Self-registration must never grant staff/admin privileges.
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token, session, user = auth.login(db, body.login_id, body.password, client_ip)
    expires_in = int((session.expires_at - datetime.now(UTC)).total_seconds())
    return LoginResponse(access_token=token, expires_in=expires_in, user=public_user(user))


@router.post("/auth/logout", status_code=204)
def logout(token: str = Depends(bearer_token), auth: AuthService = Depends(get_auth_service)) -> None:
    auth.logout(token)


@router.get("/me", response_model=MeResponse)
def me(current: tuple[User, AuthSession] = Depends(current_session)) -> MeResponse:
    user, session = current
    return MeResponse(
        user=public_user(user),
        roles=[user.role],
        session=SessionInfo(expires_at=session.expires_at.isoformat(timespec="seconds")),
    )


@router.get("/me/courses", response_model=CoursesResponse)
def my_courses(user: User = Depends(current_user), db: Session = Depends(get_db)) -> CoursesResponse:
    """Môn người hiện tại được hỏi đáp/tìm (PRD 11.2, 5.1) kèm quyền quản lý do backend tính."""
    items = []
    for course_id in acl.readable_course_ids(db, user):
        course = db.get(Course, course_id)
        if course is None:
            continue
        items.append(
            CourseItem(
                id=course.id,
                code=course.code,
                name=course.name,
                term=course.term,
                assigned=acl.active_membership(db, user, course.id) is not None,
                can_upload=acl.can_upload(db, user, course.id),
                can_review=acl.can_review(db, user, course.id),
            )
        )
    items.sort(key=lambda c: (not c.assigned, c.id))
    return CoursesResponse(items=items)
