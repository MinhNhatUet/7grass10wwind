from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.deps import bearer_token, current_session, current_user
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
from src.services.auth import AuthService, get_auth_service, hash_password
from src.services.auth import Session as AuthSession
from src.services.errors import AppError

router = APIRouter()


def public_user(user: User) -> UserPublic:
    return UserPublic(id=user.id, login_id=user.login_id, display_name=user.display_name, role=user.role)


@router.post("/auth/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    client_ip = request.client.host if request.client else "unknown"
    token, session, user = auth.login(db, body.login_id, body.password, client_ip)
    expires_in = int((session.expires_at - datetime.now(UTC)).total_seconds())
    return LoginResponse(access_token=token, expires_in=expires_in, user=public_user(user))


@router.post("/auth/register", response_model=LoginResponse, status_code=201)
async def register(
    body: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    """Tự đăng ký (D-35). Vai trò luôn là student, không có môn nào — Quản trị cấp môn/vai trò sau (BR-02, PRD 5.1)."""
    login_id = body.login_id.strip()
    if db.scalar(select(User).where(func.lower(User.login_id) == login_id.casefold())):
        raise AppError("LOGIN_ID_TAKEN", 409)
    user = User(
        login_id=login_id,
        display_name=(body.display_name or "").strip() or login_id.split("@")[0],
        role="student",
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.flush()
    audit.record(db, actor_id=user.id, action="self_register", object_type="user", object_id=user.id)
    db.commit()
    client_ip = request.client.host if request.client else "unknown"
    token, session, user = auth.login(db, login_id, body.password, client_ip)
    expires_in = int((session.expires_at - datetime.now(UTC)).total_seconds())
    return LoginResponse(access_token=token, expires_in=expires_in, user=public_user(user))


@router.post("/auth/logout", status_code=204)
async def logout(token: str = Depends(bearer_token), auth: AuthService = Depends(get_auth_service)) -> None:
    auth.logout(token)


@router.get("/me", response_model=MeResponse)
async def me(current: tuple[User, AuthSession] = Depends(current_session)) -> MeResponse:
    user, session = current
    return MeResponse(
        user=public_user(user),
        roles=[user.role],
        session=SessionInfo(expires_at=session.expires_at.isoformat(timespec="seconds")),
    )


@router.get("/me/courses", response_model=CoursesResponse)
async def my_courses(user: User = Depends(current_user), db: Session = Depends(get_db)) -> CoursesResponse:
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
