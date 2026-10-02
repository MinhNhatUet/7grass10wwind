"""Ghi lượt dùng AI và ước tính chi phí (D-60). Không lưu nội dung câu hỏi (BL-25)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.orm import UsageEvent

# Lượt gọi AI không phải câu hỏi chat — không tính vào hạn mức câu hỏi/ngày của người dùng
NON_CHAT = ("quiz_generate", "quiz_assess")


def cost_usd(tokens_in: int, tokens_out: int) -> float:
    s = get_settings()
    return (tokens_in * s.llm_price_input_per_1m + tokens_out * s.llm_price_output_per_1m) / 1_000_000


def record(
    db: Session,
    *,
    user_id: str,
    course_id: str | None,
    assistant: str,
    status: str,
    latency_ms: float | None,
    request_id: str | None,
    tokens: list[int],
) -> None:
    db.add(
        UsageEvent(
            user_id=user_id,
            course_id=course_id,
            assistant=assistant,
            status=status,
            latency_ms=latency_ms,
            request_id=request_id,
            tokens_input=tokens[0],
            tokens_output=tokens[1],
            estimated_cost=cost_usd(tokens[0], tokens[1]),
        )
    )
