"""Add rolling conversation summaries.

Revision ID: 0003_conversation_summaries
Revises: 0002_agent_actions
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_conversation_summaries"
down_revision = "0002_agent_actions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("agent_conversations") as batch:
        batch.add_column(sa.Column("summary", sa.Text(), server_default="", nullable=False))
        batch.add_column(sa.Column("summarized_message_id", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("agent_conversations") as batch:
        batch.drop_column("summarized_message_id")
        batch.drop_column("summary")
