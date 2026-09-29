"""Store validated task creation and duration previews.

Revision ID: 0004_agent_task_edits
Revises: 0003_conversation_summaries
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_agent_task_edits"
down_revision = "0003_conversation_summaries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("agent_actions") as batch:
        batch.add_column(sa.Column("subject", sa.String(20), nullable=True))
        batch.add_column(sa.Column("original_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("agent_actions") as batch:
        batch.drop_column("original_minutes")
        batch.drop_column("subject")
