from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from src.config import get_settings

# Endpoint tương thích OpenAI của Gemini API
GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


def get_llm(temperature: float | None = None, model: str | None = None) -> ChatOpenAI:
    settings = get_settings()
    return ChatOpenAI(
        model=model or settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.ai_base_url or None,
        temperature=settings.llm_temperature if temperature is None else temperature,
        # D-64: mặc định của client là 600 s × 3 lần thử → một câu hỏi có thể treo hàng chục phút khi provider chập chờn
        timeout=settings.llm_timeout_seconds,
        max_retries=1,  # thử lại 1 lần với lỗi tạm thời (5xx/timeout) của provider
    )


def get_embeddings() -> OpenAIEmbeddings:
    """Embedding theo EMBEDDING_PROVIDER/EMBEDDING_MODEL/EMBEDDING_DIMENSION trong .env."""
    settings = get_settings()
    if not settings.embedding_model:
        raise RuntimeError("Chưa cấu hình EMBEDDING_MODEL trong .env")
    if settings.embedding_provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("EMBEDDING_PROVIDER=gemini nhưng thiếu GEMINI_API_KEY trong .env")
        api_key, base_url = settings.gemini_api_key, GEMINI_OPENAI_BASE_URL
    elif settings.embedding_api_key:  # D-77: OpenAI chính hãng, tách khỏi endpoint LLM
        api_key, base_url = settings.embedding_api_key, settings.embedding_base_url or None
    else:
        api_key, base_url = settings.llm_api_key, settings.ai_base_url or None
    return OpenAIEmbeddings(
        model=settings.embedding_model,
        api_key=api_key,
        base_url=base_url,
        dimensions=settings.embedding_dimension,
        # Endpoint không phải OpenAI không nhận input dạng token id
        check_embedding_ctx_length=False,
    )
