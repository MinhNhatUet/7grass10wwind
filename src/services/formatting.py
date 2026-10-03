"""Định dạng thời gian dùng chung cho mọi API (L-01).

SQLite trả datetime không múi giờ dù ghi UTC → luôn gắn UTC trước khi xuất, để trình duyệt không hiểu nhầm là giờ địa
phương.
"""

from __future__ import annotations

from datetime import UTC, datetime


def aware(dt: datetime | None) -> datetime | None:
    """Datetime có múi giờ (mặc định UTC); None giữ nguyên."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def iso(dt: datetime | None) -> str | None:
    """ISO 8601 đến giây, có múi giờ. Hợp đồng API (L-07): trường thời gian chưa có giá trị trả `null`, không trả
    chuỗi rỗng hay mốc giả — client phải xử lý `null`."""
    return aware(dt).isoformat(timespec="seconds") if dt else None
