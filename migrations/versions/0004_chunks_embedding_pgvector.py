"""D-84: Postgres + pgvector — chunks.embedding thành cột `vector` để tìm cosine trong SQL. SQLite giữ BLOB (no-op).

Chỉ đổi kiểu trên DB Postgres CHƯA có embedding (dựng mới rồi ingest lại); có dữ liệu thì dừng thay vì xóa.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-06

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: str | Sequence[str] | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    filled = bind.exec_driver_sql("SELECT count(*) FROM chunks WHERE embedding IS NOT NULL").scalar()
    if filled:
        raise RuntimeError(f"chunks có {filled} embedding dạng bytea — dựng DB Postgres mới rồi ingest lại (D-84)")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("ALTER TABLE chunks ALTER COLUMN embedding TYPE vector USING NULL")


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("ALTER TABLE chunks ALTER COLUMN embedding TYPE bytea USING NULL")
