"""Add image_blocks table

Revision ID: 011
Revises: 010
Create Date: 2026-08-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "image_blocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sort_order", sa.Integer(), default=0),
        sa.Column("label", sa.String(200), default="Photo"),
        sa.Column("position_x", sa.Float(), default=0.5),
        sa.Column("position_y", sa.Float(), default=0.5),
        sa.Column("width", sa.Float(), default=0.3),
        sa.Column("height", sa.Float(), default=0.3),
        sa.Column("mask_shape", sa.String(20), default="none"),
        sa.Column("mask_feather", sa.Float(), default=0.0),
        sa.Column("frame_image_key", sa.String(500), nullable=True),
        sa.Column("ken_burns_enabled", sa.Boolean(), default=False),
        sa.Column("ken_burns_zoom", sa.Float(), default=1.2),
        sa.Column("ken_burns_direction", sa.String(20), default="zoom_in"),
        sa.Column("opacity", sa.Float(), default=1.0),
        sa.Column("animation_type", sa.String(20), default="none"),
        sa.Column("start_time", sa.Float(), default=0.0),
        sa.Column("end_time", sa.Float(), default=3.0),
        sa.Column("placeholder_key", sa.String(500), nullable=True),
        sa.Column("is_user_uploadable", sa.Boolean(), default=True),
    )


def downgrade() -> None:
    op.drop_table("image_blocks")
