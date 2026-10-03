"""Dọn dữ liệu định kỳ (BL-26): xoá hẳn hội thoại đã xoá mềm quá 30 ngày. Audit log giữ nguyên (BR-11)."""

import logging
import threading
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.db import get_sessionmaker
from src.models.orm import Citation, Conversation, Message

log = logging.getLogger(__name__)


INTERVAL_S = 86400
_stop = threading.Event()


def _cleanup_worker() -> None:
    next_run = time.monotonic()
    while not _stop.is_set():
        try:
            db: Session = get_sessionmaker()()
            try:
                # 1. Clean up soft-deleted conversations older than 30 days
                cutoff_conv = datetime.now(UTC) - timedelta(days=30)
                expired_convs = db.scalars(select(Conversation.id).where(Conversation.deleted_at < cutoff_conv)).all()

                if expired_convs:
                    db.execute(
                        delete(Citation).where(
                            Citation.message_id.in_(
                                select(Message.id).where(Message.conversation_id.in_(expired_convs))
                            )
                        )
                    )
                    db.execute(delete(Message).where(Message.conversation_id.in_(expired_convs)))
                    db.execute(delete(Conversation).where(Conversation.id.in_(expired_convs)))

                # Audit log KHÔNG bao giờ bị xoá: chỉ ghi thêm (BR-11) — bỏ bước xoá audit > 90 ngày của bản gốc (D-53)

                db.commit()
                log.info(
                    "retention: dọn %d hội thoại",
                    len(expired_convs),
                    extra={"event": "retention.run", "conversations_deleted": len(expired_convs)},
                )
            except Exception:
                db.rollback()
                log.exception("retention lỗi, đã rollback", extra={"event": "retention.failed"})
            finally:
                db.close()
        except Exception:  # không mở được session DB — ghi lại, thử lại ở chu kỳ sau
            log.exception("retention không chạy được", extra={"event": "retention.failed"})

        # M-06: chạy theo lịch cố định mỗi 24 giờ (không trôi theo thời gian dọn); Event cho phép dừng ngay khi tắt app
        next_run += INTERVAL_S
        _stop.wait(max(0.0, next_run - time.monotonic()))


def start_retention_job() -> None:
    _stop.clear()
    threading.Thread(target=_cleanup_worker, daemon=True, name="retention-job").start()


def stop_retention_job() -> None:
    _stop.set()
