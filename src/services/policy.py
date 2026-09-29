"""Chính sách trước khi truy xuất (PRD 10.1 bước 2; BR-06, BR-09; NFR-09, NFR-10).

Nhận diện yêu cầu xin đáp án/lời giải bài tính điểm bằng luật từ khóa — đây là guardrail tối giản,
có thể bỏ sót hoặc chặn nhầm; chất lượng phải đo bằng safety suite (UC-05) và prompt vẫn cấm lời giải hoàn chỉnh.
"""

from __future__ import annotations

import re
import unicodedata

INTEGRITY_MESSAGE = (
    "Tôi có thể giúp bạn hiểu kiến thức và cách tiếp cận, nhưng không cung cấp đáp án cho bài đang tính điểm."
)
INSUFFICIENT_MESSAGE = (
    "Tôi chưa tìm thấy đủ căn cứ trong tài liệu bạn được phép truy cập của môn này. "
    "Bạn có thể nêu rõ chương hoặc chọn tài liệu cụ thể."
)
SERVICE_ERROR_MESSAGE = "Chưa thể tạo câu trả lời lúc này. Bạn có thể thử lại hoặc tìm tài liệu trong Knowledge Hub."
SOURCE_WITHDRAWN_MESSAGE = "Nguồn này hiện không còn khả dụng. Hãy tìm phiên bản đang được phép sử dụng."
HUB_EMPTY_MESSAGE = "Không tìm thấy tài liệu phù hợp trong phạm vi môn hiện tại. Thử bỏ bớt bộ lọc hoặc đổi từ khóa."


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return text.replace("đ", "d")


# (hành vi xin đáp án) + (ngữ cảnh bài tính điểm)
_ASK = r"(dap an|loi giai|giai (ho|giup|dum|bai)|lam (ho|giup|dum)|cho (em|minh|toi) (xin )?(ket qua|dap an)|full solution|answer key|solve (this|my))"
_GRADED = r"(bai tap|bai kiem tra|kiem tra|de thi|thi cuoi ky|thi giua ky|bai nop|nop bai|assignment|homework|quiz|midterm|final exam|tinh diem|lab \d|bai \d)"


def is_integrity_violation(text: str) -> bool:
    folded = _fold(text)
    return bool(re.search(_ASK, folded) and re.search(_GRADED, folded))


def looks_like_injection(text: str) -> bool:
    """Chỉ dùng để gắn cờ trong log; nội dung tài liệu luôn được coi là dữ liệu, không phải chỉ thị (BR-09)."""
    folded = _fold(text)
    return bool(re.search(r"(ignore (all|previous)|bo qua (moi|cac) chi thi|system prompt|api key|reveal)", folded))
