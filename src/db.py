"""Kết nối SQLite qua SQLAlchemy (D-20). Đổi DATABASE_URL để chuyển sang DB khác."""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path

from sqlalchemy import Engine, create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from src.config import get_settings

REPO_ROOT = Path(__file__).resolve().parent.parent


class Base(DeclarativeBase):
    pass


def _resolve_sqlite_url(url: str) -> str:
    """sqlite:///./data/app.db được hiểu tương đối với gốc repo, không phụ thuộc thư mục chạy."""
    prefix = "sqlite:///"
    if url.startswith(prefix) and not url.startswith("sqlite:////") and ":memory:" not in url:
        path = Path(url[len(prefix) :])
        if not path.is_absolute():
            path = REPO_ROOT / path
        path.parent.mkdir(parents=True, exist_ok=True)
        return prefix + path.as_posix()
    return url


@lru_cache
def get_engine() -> Engine:
    url = _resolve_sqlite_url(get_settings().database_url)
    engine = create_engine(url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {})
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _pragmas(conn, _record) -> None:  # noqa: ANN001
            cur = conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

    return engine


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def init_db() -> None:
    from src.models import orm  # noqa: F401  (đăng ký bảng)

    engine = get_engine()
    Base.metadata.create_all(engine)
    _migrate_nullable_conversation_course(engine)
    _migrate_conversation_document(engine)


def _migrate_conversation_document(engine: Engine) -> None:
    """Add optional document scope to existing SQLite and PostgreSQL databases without replacing data."""
    with engine.begin() as conn:
        if "document_id" not in {c["name"] for c in inspect(conn).get_columns("conversations")}:
            conn.exec_driver_sql("ALTER TABLE conversations ADD COLUMN document_id VARCHAR(40)")


def _migrate_nullable_conversation_course(engine: Engine) -> None:
    """D-28: DB tạo trước đó có conversations.course_id NOT NULL → dựng lại bảng theo quy trình SQLite
    (tắt FK, legacy_alter_table=ON để tham chiếu từ bảng khác giữ nguyên tên, tạo bảng mới → chép → đổi tên)."""
    if engine.dialect.name != "sqlite":
        return
    from sqlalchemy.schema import CreateIndex, CreateTable

    from src.models.orm import Conversation

    table = Conversation.__table__
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cols = cur.execute("PRAGMA table_info(conversations)").fetchall()
        if not any(c[1] == "course_id" and c[3] == 1 for c in cols):
            return
        names = ", ".join(c[1] for c in cols)
        ddl = str(CreateTable(table).compile(engine)).replace(
            "CREATE TABLE conversations", "CREATE TABLE conversations_new", 1
        )
        cur.execute("PRAGMA foreign_keys=OFF")
        cur.execute("PRAGMA legacy_alter_table=ON")
        cur.execute("BEGIN")
        cur.execute(ddl)
        cur.execute(f"INSERT INTO conversations_new ({names}) SELECT {names} FROM conversations")
        cur.execute("DROP TABLE conversations")
        cur.execute("ALTER TABLE conversations_new RENAME TO conversations")
        for index in table.indexes:
            cur.execute(str(CreateIndex(index).compile(engine)))
        broken = cur.execute("PRAGMA foreign_key_check").fetchall()
        if broken:
            cur.execute("ROLLBACK")
            raise RuntimeError(f"migration conversations lỗi khóa ngoại: {broken[:3]}")
        cur.execute("COMMIT")
    finally:
        cur = raw.cursor()
        cur.execute("PRAGMA legacy_alter_table=OFF")
        cur.execute("PRAGMA foreign_keys=ON")
        raw.close()


def get_db() -> Iterator[Session]:
    """Dependency FastAPI: một session cho mỗi request."""
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()
