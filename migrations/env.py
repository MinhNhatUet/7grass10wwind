"""Môi trường Alembic: dùng chung engine và metadata với app (M-09)."""

from alembic import context

from src.db import Base, get_engine
from src.models import orm  # noqa: F401  (đăng ký bảng vào Base.metadata)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    # init_db truyền sẵn connection (cùng engine của app); chạy CLI thì tự mở theo DATABASE_URL
    connection = context.config.attributes.get("connection")
    if connection is None:
        with get_engine().connect() as conn:
            _run(conn)
            conn.commit()
    else:
        _run(connection)


def _run(connection) -> None:  # noqa: ANN001
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=connection.dialect.name == "sqlite",  # SQLite không ALTER được ràng buộc → dựng lại bảng
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise SystemExit("Không hỗ trợ chế độ offline — chạy migration với DATABASE_URL thật")
run_migrations_online()
