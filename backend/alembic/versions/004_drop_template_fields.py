"""Drop template_fields table

Revision ID: 004
Revises: 003
Create Date: 2024-01-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("template_fields")


def downgrade() -> None:
    op.create_table(
        "template_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_key", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("placeholder", sa.String(200), nullable=True),
        sa.Column("field_type", sa.String(20), default="text"),
        sa.Column("is_required", sa.Boolean(), default=True),
        sa.Column("sort_order", sa.Integer(), default=0),
        sa.Column("position_x", sa.Float(), default=0.5),
        sa.Column("position_y", sa.Float(), default=0.5),
        sa.Column("max_width", sa.Float(), default=0.8),
        sa.Column("font_size_ratio", sa.Float(), default=0.05),
        sa.Column("text_align", sa.String(10), default="center"),
        sa.Column("text_color", sa.String(20), default="#FFFFFF"),
        sa.Column("animation_type", sa.String(20), default="fade_in"),
        sa.Column("appear_frame", sa.Integer(), default=0),
        sa.Column("duration_frames", sa.Integer(), default=30),
    )
