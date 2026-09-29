from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from src.api.admin import router as admin_router
from src.api.auth import router as auth_router
from src.api.conversations import router as conversations_router
from src.api.dashboard import router as dashboard_router
from src.api.documents import router as documents_router
from src.api.routes import router
from src.api.sources import router as sources_router
from src.config import get_settings
from src.db import get_engine, init_db
from src.models.schemas import ErrorBody, ErrorDetail
from src.services.documents import resume_interrupted_jobs
from src.services.errors import AppError
from src.services.retention import start_retention_job


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    init_db()
    if settings.app_env != "test":
        resume_interrupted_jobs()
        start_retention_job()
    yield
    print("Shutting down...")


app = FastAPI(
    title="EDU-04 — Kho tri thức hỗ trợ học thuật",
    description="MVP: Academic/Learning Assistant, Knowledge Hub, vòng đời tài liệu có HITL",
    version="0.1.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
for r in (auth_router, documents_router, conversations_router, sources_router, dashboard_router, admin_router):
    app.include_router(r, prefix="/api/v1")


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Lỗi kỹ thuật theo PRD 11.4: {"status": "error", "error": {"code", "retryable"}}."""
    body = ErrorBody(error=ErrorDetail(code=exc.code, retryable=exc.retryable, message=exc.message))
    headers = {}
    if exc.http_status == 401:
        headers["WWW-Authenticate"] = "Bearer"
    if exc.retry_after is not None:
        headers["Retry-After"] = str(exc.retry_after)
    return JSONResponse(status_code=exc.http_status, content=body.model_dump(exclude_none=True), headers=headers if headers else None)


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
