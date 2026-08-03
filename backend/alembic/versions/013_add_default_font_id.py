"""add default_font_id to templates

Revision ID: 013
Revises: 012
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "013"
down_revision = "012"


def upgrade() -> None:
    op.add_column(
        "templates",
        sa.Column("default_font_id", UUID(as_uuid=True), sa.ForeignKey("fonts.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("templates", "default_font_id")
