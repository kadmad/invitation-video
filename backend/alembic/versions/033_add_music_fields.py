"""Add customer-uploaded music fields to payments and render_jobs

Revision ID: 033
Revises: 032
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "033"
down_revision: Union[str, None] = "032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("music_key", sa.String(length=500), nullable=True))
    op.add_column("payments", sa.Column("music_start_seconds", sa.Float(), nullable=True))
    op.add_column("render_jobs", sa.Column("music_key", sa.String(length=500), nullable=True))
    op.add_column("render_jobs", sa.Column("music_start_seconds", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("render_jobs", "music_start_seconds")
    op.drop_column("render_jobs", "music_key")
    op.drop_column("payments", "music_start_seconds")
    op.drop_column("payments", "music_key")
