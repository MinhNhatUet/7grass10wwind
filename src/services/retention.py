"""Dọn dữ liệu định kỳ (BL-26): xoá hẳn hội thoại đã xoá mềm quá 30 ngày. Audit log giữ nguyên (BR-11)."""

import threading
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.db import get_sessionmaker
from src.models.orm import Citation, Conversation, Message


def _cleanup_worker() -> None:
    while True:
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
            except Exception:
                db.rollback()
            finally:
                db.close()
        except Exception:
            pass

        # Run once a day
        time.sleep(86400)


def start_retention_job() -> None:
    threading.Thread(target=_cleanup_worker, daemon=True, name="retention-job").start()
