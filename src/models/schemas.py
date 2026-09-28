from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")


class ChatSource(BaseModel):
    id: str
    title: str
    page: int
    content: str
    url: str | None = None

class ChatResponse(BaseModel):
    response: str = Field(..., description="Phản hồi từ agent")
    analysis: str = Field(default="", description="Phân tích nội bộ")
    sources: list[ChatSource] = Field(default_factory=list, description="Danh sách tài liệu tham khảo")


# --- Auth (UC-09, PRD 9.1 / 11.2) ---

Role = Literal["student", "lecturer", "reviewer", "admin"]


class LoginRequest(BaseModel):
    login_id: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=1, max_length=200)


class RegisterRequest(BaseModel):
    login_id: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=1, max_length=200)
    display_name: str | None = None
    role: Role = "student"


class UserPublic(BaseModel):
    id: str
    login_id: str
    display_name: str
    role: Role


class SessionInfo(BaseModel):
    expires_at: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(..., description="Số giây còn hiệu lực")
    user: UserPublic


class MeResponse(BaseModel):
    """PRD 11.2: GET /me trả {user, roles, session}; frontend không tự quyết định role."""

    user: UserPublic
    roles: list[Role]
    session: SessionInfo


class CourseItem(BaseModel):
    id: str
    code: str | None = None
    name: str
    term: str | None = None
    assigned: bool = False
    can_upload: bool = False
    can_review: bool = False


class CoursesResponse(BaseModel):
    items: list[CourseItem]


class ErrorDetail(BaseModel):
    code: str
    retryable: bool = False
    message: str | None = None


class ErrorBody(BaseModel):
    """PRD 11.4: lỗi kỹ thuật trả {"status": "error", "error": {"code", "retryable"}}."""

    status: Literal["error"] = "error"
    error: ErrorDetail
