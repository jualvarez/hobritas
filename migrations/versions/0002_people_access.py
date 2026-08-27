"""Optional worker access.

Revision ID: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workers") as batch:
        batch.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("access_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_foreign_key("fk_workers_user_id", "users", ["user_id"], ["id"])
        batch.create_unique_constraint("uq_workers_user_id", ["user_id"])


def downgrade() -> None:
    with op.batch_alter_table("workers") as batch:
        batch.drop_constraint("uq_workers_user_id", type_="unique")
        batch.drop_constraint("fk_workers_user_id", type_="foreignkey")
        batch.drop_column("access_enabled")
        batch.drop_column("user_id")
