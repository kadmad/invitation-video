"""Add watermark/discount fields to templates, is_watermarked to payments and render_jobs

Revision ID: 029
Revises: 028
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("templates", "price", nullable=True, server_default=None)
    op.add_column("templates", sa.Column("discount_amount_paise", sa.Integer(), nullable=True))
    op.add_column("templates", sa.Column("watermark_position_x", sa.Float(), nullable=True, server_default="0.39"))
    op.add_column("templates", sa.Column("watermark_position_y", sa.Float(), nullable=True, server_default="0.88"))
    op.add_column("templates", sa.Column("watermark_width", sa.Float(), nullable=True, server_default="0.22"))
    op.add_column("payments", sa.Column("is_watermarked", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("render_jobs", sa.Column("is_watermarked", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("render_jobs", "is_watermarked")
    op.drop_column("payments", "is_watermarked")
    op.drop_column("templates", "watermark_width")
    op.drop_column("templates", "watermark_position_y")
    op.drop_column("templates", "watermark_position_x")
    op.drop_column("templates", "discount_amount_paise")
    op.alter_column("templates", "price", nullable=False, server_default="9900")
