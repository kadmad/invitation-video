"""Add text_blocks table, is_published/tag_labels to templates, nullable font_id on render_jobs

Revision ID: 002
Revises: 001
Create Date: 2024-01-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_published and tag_labels to templates
    op.add_column("templates", sa.Column("is_published", sa.Boolean(), server_default="false"))
    op.add_column("templates", sa.Column("tag_labels", postgresql.JSONB(), nullable=True))

    # Make render_jobs.font_id nullable
    op.alter_column("render_jobs", "font_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)

    # Create text_blocks table
    op.create_table(
        "text_blocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sort_order", sa.Integer(), default=0),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("position_x", sa.Float(), default=0.5),
        sa.Column("position_y", sa.Float(), default=0.5),
        sa.Column("max_width", sa.Float(), default=0.8),
        sa.Column("font_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fonts.id"), nullable=True),
        sa.Column("font_size_ratio", sa.Float(), default=0.05),
        sa.Column("text_color", sa.String(20), default="#FFFFFF"),
        sa.Column("text_align", sa.String(10), default="center"),
        sa.Column("animation_type", sa.String(20), default="fade_in"),
        sa.Column("start_time", sa.Float(), default=0.0),
        sa.Column("end_time", sa.Float(), default=2.0),
        sa.Column("tag_config", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("text_blocks")
    op.alter_column("render_jobs", "font_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_column("templates", "tag_labels")
    op.drop_column("templates", "is_published")
