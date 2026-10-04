import logging
from contextlib import asynccontextmanager

import anyio.to_thread
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from src.api.admin import router as admin_router
from src.api.auth import router as auth_router
from src.api.conversations import router as conversations_router
from src.api.dashboard import router as dashboard_router
from src.api.documents import router as documents_router
from src.api.learning_path import router as learning_path_router
from src.api.quizzes import router as quizzes_router
from src.api.sources import router as sources_router
from src.config import get_settings
from src.db import get_engine, init_db
from src.models.schemas import ErrorBody, ErrorDetail
from src.observability import configure_logging, install, request_id
from src.services.documents import resume_interrupted_jobs
from src.services.errors import AppError
from src.services.retention import start_retention_job, stop_retention_job


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    # M-12: endpoint đồng bộ (chat gọi LLM 10–60 s) chạy trong threadpool AnyIO, mặc định chỉ 40 luồng → nâng trần để
    # vài chục câu hỏi đang chờ LLM không chặn đăng nhập/thư viện. Stream (SSE) là hướng lâu dài (H-3).
    anyio.to_thread.current_default_thread_limiter().total_tokens = settings.http_thread_limit
    init_db()
    if settings.app_env != "test":
        resume_interrupted_jobs()
        start_retention_job()
    yield
    print("Shutting down...")
    stop_retention_job()


app = FastAPI(
    title="EDU-04 — Kho tri thức hỗ trợ học thuật",
    description="MVP: Academic/Learning Assistant, Knowledge Hub, vòng đời tài liệu có HITL",
    version="0.1.0",
    lifespan=lifespan,
)

settings = get_settings()
configure_logging("edu04-backend", settings.app_env, settings.log_level)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    # Xác thực bằng header Bearer, không dùng cookie → không cần credentials; chỉ mở đúng method/header frontend dùng
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
    expose_headers=["X-Request-ID"],  # frontend khác origin đọc được mã hỗ trợ
)
install(app)  # thêm sau CORS → bọc ngoài cùng, mọi response (kể cả lỗi) đều có X-Request-ID

for r in (
    auth_router,
    documents_router,
    conversations_router,
    sources_router,
    dashboard_router,
    admin_router,
    quizzes_router,
    learning_path_router,
):
    app.include_router(r, prefix="/api/v1")


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Lỗi kỹ thuật theo PRD 11.4: {"status": "error", "error": {"code", "retryable"}}."""
    body = ErrorBody(
        error=ErrorDetail(code=exc.code, retryable=exc.retryable, message=exc.message, request_id=request_id.get())
    )
    if exc.http_status >= 500:  # lỗi kỹ thuật: ghi mã lỗi (không ghi nội dung) để tra theo mã hỗ trợ
        logging.getLogger("edu04.errors").warning(
            "%s %s", exc.code, request.url.path, extra={"event": "app.error", "error_code": exc.code,
                                                         "status": exc.http_status, "retryable": exc.retryable})  # fmt: skip
    headers = {}
    if exc.http_status == 401:
        headers["WWW-Authenticate"] = "Bearer"
    if exc.retry_after is not None:
        headers["Retry-After"] = str(exc.retry_after)
    return JSONResponse(
        status_code=exc.http_status, content=body.model_dump(exclude_none=True), headers=headers if headers else None
    )


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}


@app.get("/api/v1/health")
async def health_v1():
    """PRD 11.2: tiến trình còn sống."""
    return {"status": "ok"}


@app.get("/api/v1/ready")
async def ready():
    """PRD 11.2: DB tối thiểu sẵn sàng (NFR-04)."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready"}
