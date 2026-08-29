"""Add admin-chosen template soundtrack

Revision ID: 034
Revises: 033
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "034"
down_revision: Union[str, None] = "033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("templates", sa.Column("music_key", sa.String(length=500), nullable=True))
    op.add_column(
        "templates",
        sa.Column("music_start_seconds", sa.Float(), nullable=True, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("templates", "music_start_seconds")
    op.drop_column("templates", "music_key")
