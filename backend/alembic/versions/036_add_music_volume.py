"""Add template soundtrack volume

Revision ID: 036
Revises: 035
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "036"
down_revision: Union[str, None] = "035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "templates",
        sa.Column("music_volume", sa.Float(), nullable=True, server_default="1.0"),
    )


def downgrade() -> None:
    op.drop_column("templates", "music_volume")
