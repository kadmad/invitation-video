"""Add rotation to text_blocks, image_blocks, and watermark_rotation to templates

Revision ID: 030
Revises: 029
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "030"
down_revision: Union[str, None] = "029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("text_blocks", sa.Column("rotation", sa.Float(), nullable=True, server_default="0.0"))
    op.add_column("image_blocks", sa.Column("rotation", sa.Float(), nullable=True, server_default="0.0"))
    op.add_column("templates", sa.Column("watermark_rotation", sa.Float(), nullable=True, server_default="0.0"))


def downgrade() -> None:
    op.drop_column("templates", "watermark_rotation")
    op.drop_column("image_blocks", "rotation")
    op.drop_column("text_blocks", "rotation")
