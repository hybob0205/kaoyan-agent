"""Add per-user copies of local study app records.

Revision ID: 0005_app_snapshots
Revises: 0004_agent_task_edits
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_app_snapshots"
down_revision = "0004_agent_task_edits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The running app may have created this table through metadata.create_all
    # before Alembic reaches this revision. Accept only the expected schema.
    inspector = sa.inspect(op.get_bind())
    if "app_snapshots" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("app_snapshots")}
        unique = {tuple(item["column_names"]) for item in inspector.get_unique_constraints("app_snapshots")}
        indexes = {tuple(item["column_names"]) for item in inspector.get_indexes("app_snapshots")}
        if columns != {"id", "user_id", "app_id", "version", "data_json", "updated_at"} or ("user_id", "app_id") not in unique or ("user_id",) not in indexes:
            raise RuntimeError("Existing app_snapshots table does not match migration 0005")
        return
    op.create_table(
        "app_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("app_id", sa.String(30), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("data_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "app_id", name="uq_app_snapshot_user_app"),
    )
    op.create_index("ix_app_snapshots_user_id", "app_snapshots", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_app_snapshots_user_id", table_name="app_snapshots")
    op.drop_table("app_snapshots")
