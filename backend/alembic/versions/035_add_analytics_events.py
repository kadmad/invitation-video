"""Add first-party funnel analytics events

Revision ID: 035
Revises: 034
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "035"
down_revision: Union[str, None] = "034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "analytics_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event", sa.String(length=50), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("anon_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("value", sa.Float(), nullable=True),
        sa.Column("meta", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_analytics_events_event", "analytics_events", ["event"])
    op.create_index("ix_analytics_events_anon_id", "analytics_events", ["anon_id"])
    op.create_index("ix_analytics_events_event_created", "analytics_events", ["event", "created_at"])
    op.create_index("ix_analytics_events_template_event", "analytics_events", ["template_id", "event"])


def downgrade() -> None:
    op.drop_index("ix_analytics_events_template_event", table_name="analytics_events")
    op.drop_index("ix_analytics_events_event_created", table_name="analytics_events")
    op.drop_index("ix_analytics_events_anon_id", table_name="analytics_events")
    op.drop_index("ix_analytics_events_event", table_name="analytics_events")
    op.drop_table("analytics_events")
