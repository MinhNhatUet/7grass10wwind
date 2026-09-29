"""Background jobs for data retention and cleanup (BL-26)."""

import threading
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.db import get_sessionmaker
from src.models.orm import Conversation, Message, Citation, AuditEvent

def _cleanup_worker() -> None:
    while True:
        try:
            db: Session = get_sessionmaker()()
            try:
                # 1. Clean up soft-deleted conversations older than 30 days
                cutoff_conv = datetime.now(UTC) - timedelta(days=30)
                expired_convs = db.scalars(
                    select(Conversation.id)
                    .where(Conversation.deleted_at < cutoff_conv)
                ).all()

                if expired_convs:
                    db.execute(delete(Citation).where(Citation.message_id.in_(
                        select(Message.id).where(Message.conversation_id.in_(expired_convs))
                    )))
                    db.execute(delete(Message).where(Message.conversation_id.in_(expired_convs)))
                    db.execute(delete(Conversation).where(Conversation.id.in_(expired_convs)))

                # 2. Clean up audit events older than 90 days
                cutoff_audit = datetime.now(UTC) - timedelta(days=90)
                db.execute(delete(AuditEvent).where(AuditEvent.created_at < cutoff_audit))
                
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
