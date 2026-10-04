from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "AI20K Agent"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "127.0.0.1"  # L-04: dev chỉ nghe máy local; container ghi đè 0.0.0.0 (Dockerfile)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000"  # trình duyệt coi localhost và 127.0.0.1 là 2 origin
    )
    http_thread_limit: int = Field(default=100, ge=1)  # M-12: số request đồng bộ chạy song song

    # LLM — endpoint tương thích OpenAI (AI_* trong .env); OPENAI_API_KEY/MODEL_NAME là fallback cũ
    ai_provider: str = ""
    ai_api_key: str = ""
    ai_base_url: str = ""
    ai_model: str = ""
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    llm_timeout_seconds: float = Field(default=60, gt=0)  # D-64: mỗi lần gọi LLM
    # D-71: nút "Đăng nhập demo" (chọn vai trò, không cần mật khẩu). CHỈ bật ở môi trường demo; production luôn tắt.
    demo_login_enabled: bool = False
    demo_cnpm_sinhvien_login: str = "sinhvien"
    demo_cnpm_giangvien_login: str = "giangvien"
    # D-60: bảng giá để ước tính chi phí (USD / 1 triệu token). Mặc định theo giá niêm yết dòng Gemini Flash-Lite —
    # chỉnh trong .env theo giá thật của nhà cung cấp đang dùng.
    llm_price_input_per_1m: float = Field(default=0.10, ge=0)
    llm_price_output_per_1m: float = Field(default=0.40, ge=0)
    usd_to_vnd: float = Field(default=26_000, gt=0)

    @property
    def llm_api_key(self) -> str:
        return self.ai_api_key or self.openai_api_key

    @property
    def llm_model(self) -> str:
        return self.ai_model or self.model_name

    # Embedding — provider "gemini" (GEMINI_API_KEY) hoặc "openai" (dùng endpoint AI_*)
    embedding_provider: Literal["gemini", "openai"] = "gemini"
    embedding_model: str = ""
    embedding_dimension: int | None = Field(default=None, gt=0)
    gemini_api_key: str = ""
    # D-77: key riêng cho embedding OpenAI chính hãng. Có giá trị → gọi thẳng OpenAI (EMBEDDING_BASE_URL nếu cần đổi);
    # để trống → provider "openai" dùng endpoint AI_* như trước.
    embedding_api_key: str = ""
    embedding_base_url: str = ""

    # Auth tối giản MVP (UC-09). Giá trị giới hạn là đề xuất — PRD 11.2 chỉ yêu cầu "rate limit".
    auth_users_file: str = "data/auth/users.json"
    auth_session_ttl_minutes: int = Field(default=480, gt=0)
    auth_max_failed_logins: int = Field(default=5, gt=0)
    auth_max_registrations_per_hour: int = Field(default=10, gt=0)  # mỗi IP; đề xuất, cần chốt
    auth_failed_window_seconds: int = Field(default=300, gt=0)

    # MVP toàn sản phẩm (UC-11). Các ngưỡng là ĐỀ XUẤT, cần chốt (PRD 4.2, 10.2, 12.1).
    upload_max_mb: int = Field(default=100, gt=0)
    upload_max_pages: int = Field(default=2000, gt=0)  # PRD 4.2: tối đa khoảng 2.000 trang/tài liệu
    chunk_max_chars: int = Field(default=2400, gt=200)  # ~600 token (PRD 10.2: 400–800 token)
    chunk_overlap_chars: int = Field(default=300, ge=0)  # ~75 token (PRD 10.2: 50–100 token)
    embedding_batch_size: int = Field(default=8, gt=0)  # Gemini free tier giới hạn token/phút: lô 64 đoạn sách bị 429
    embedding_max_retries: int = Field(default=6, ge=0)  # chỉ cho lỗi 429 (rate limit)
    embedding_backoff_seconds: float = Field(default=10, ge=0)  # chờ 10, 20, 40… giây (tối đa 120)
    embedding_pause_seconds: float = Field(default=3, ge=0)  # nghỉ giữa các lô
    # D-34: embedding ngay sau trích xuất (chỉ mục tạm, KHÔNG tham gia tìm kiếm tới khi Published — PRD 9.2)
    embed_on_upload: bool = True
    job_max_workers: int = Field(default=2, gt=0)  # số job tài liệu chạy đồng thời; job thừa xếp hàng
    retrieval_top_k: int = Field(default=6, gt=0)  # PRD 10.2: 5–8 đoạn sau rerank
    retrieval_min_score: float = Field(default=0.55, ge=-1, le=1)  # evidence gate, hiệu chỉnh trên dev
    chat_max_input_chars: int = Field(default=5000, gt=0)
    daily_question_quota: int = Field(default=200, gt=0)
    learning_quiz_questions: int = Field(default=3, gt=0)
    # D-82: bài đánh giá theo tiến độ — trần số câu (phủ mọi chủ đề đã học trước, dư thì hỏi sâu chủ đề yếu/chưa rõ)
    learning_assessment_max_questions: int = Field(default=15, gt=0, le=60)  # 10–15 câu cho người học đỡ rối

    # Database
    database_url: str = "sqlite:///./data/app.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
