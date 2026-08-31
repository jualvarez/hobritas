"""Worker category.

Revision ID: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workers") as batch:
        batch.add_column(sa.Column("category", sa.String(length=160), nullable=True))
        batch.create_index("ix_workers_category", ["category"])


def downgrade() -> None:
    with op.batch_alter_table("workers") as batch:
        batch.drop_index("ix_workers_category")
        batch.drop_column("category")
