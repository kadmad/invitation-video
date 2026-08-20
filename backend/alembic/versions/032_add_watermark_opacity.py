"""Add watermark_opacity to templates

Revision ID: 032
Revises: 031
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "032"
down_revision: Union[str, None] = "031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("templates", sa.Column("watermark_opacity", sa.Float(), nullable=True, server_default="0.85"))


def downgrade() -> None:
    op.drop_column("templates", "watermark_opacity")
