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


BASELINE_REVISION = "0001"  # schema lúc chuyển sang Alembic (migrations/versions/0001_baseline_schema.py)


def _alembic_config():  # noqa: ANN202
    from alembic.config import Config

    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "migrations"))
    return cfg


def init_db() -> None:
    """M-09: schema do Alembic quản lý (`migrations/`).
    - DB mới: `upgrade head` dựng toàn bộ.
    - DB cũ chưa có Alembic: chạy các bước _migrate_* cũ để về đúng mốc, `stamp` mốc, rồi `upgrade head`.
    Thay đổi schema về sau: thêm migration (`alembic revision --autogenerate`), không thêm hàm _migrate_* mới."""
    from alembic import command

    from src.models import orm  # noqa: F401  (đăng ký bảng)

    engine = get_engine()
    cfg = _alembic_config()
    with engine.connect() as conn:
        tables = set(inspect(conn).get_table_names())
    if "alembic_version" not in tables and "users" in tables:
        _legacy_upgrade_to_baseline(engine)
        with engine.begin() as conn:
            cfg.attributes["connection"] = conn
            command.stamp(cfg, BASELINE_REVISION)
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")


def _legacy_upgrade_to_baseline(engine: Engine) -> None:
    """DB tạo trước Alembic: đưa về đúng schema mốc 0001 bằng các bước cũ (giữ nguyên dữ liệu)."""
    from src.models.orm import StudyPlan

    # create_all chỉ tạo bảng còn thiếu (như trước); study_plans phải có sẵn ở dạng mốc để 0002 thêm khóa ngoại
    Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if t is not StudyPlan.__table__])
    with engine.connect() as conn:
        if "study_plans" not in inspect(conn).get_table_names():
            raise RuntimeError("DB cũ thiếu bảng study_plans — sao lưu rồi tạo DB mới, hoặc nạp lại bằng seed")
    _migrate_nullable_conversation_course(engine)
    _migrate_conversation_document(engine)
    _migrate_chunk_page_map(engine)
    _migrate_chunk_section(engine)
    _migrate_citation_locator_end(engine)
    _migrate_usage_tokens(engine)


def _migrate_usage_tokens(engine: Engine) -> None:
    """D-53 (nhánh quanghung): usage_events lưu số token + chi phí ước tính; DB cũ thêm cột, dòng cũ = NULL."""
    with engine.begin() as conn:
        have = {c["name"] for c in inspect(conn).get_columns("usage_events")}
        for name, sql_type in (("tokens_input", "INTEGER"), ("tokens_output", "INTEGER"), ("estimated_cost", "FLOAT")):
            if name not in have:
                conn.exec_driver_sql(f"ALTER TABLE usage_events ADD COLUMN {name} {sql_type}")


def _migrate_citation_locator_end(engine: Engine) -> None:
    """D-50: trích dẫn có thể là một khoảng trang (vd. 4–6); DB cũ thêm cột, trích dẫn cũ = NULL (một trang)."""
    with engine.begin() as conn:
        if "locator_end" not in {c["name"] for c in inspect(conn).get_columns("citations")}:
            conn.exec_driver_sql("ALTER TABLE citations ADD COLUMN locator_end INTEGER")


def _migrate_chunk_page_map(engine: Engine) -> None:
    """D-49: bản đồ vị trí → trang cho chunk nhiều trang; DB cũ thêm cột, dữ liệu cũ giữ nguyên (NULL)."""
    with engine.begin() as conn:
        if "page_map" not in {c["name"] for c in inspect(conn).get_columns("chunks")}:
            conn.exec_driver_sql("ALTER TABLE chunks ADD COLUMN page_map JSON")


def _migrate_chunk_section(engine: Engine) -> None:
    """Section hierarchy extracted from structured parsers; old chunks remain NULL."""
    with engine.begin() as conn:
        if "section" not in {c["name"] for c in inspect(conn).get_columns("chunks")}:
            conn.exec_driver_sql("ALTER TABLE chunks ADD COLUMN section VARCHAR(1000)")


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
