"""Add letter_spacing and font_weight to text_blocks

Revision ID: 026
Revises: 025
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("text_blocks", sa.Column("letter_spacing", sa.Float(), nullable=True))
    op.add_column("text_blocks", sa.Column("font_weight", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("text_blocks", "font_weight")
    op.drop_column("text_blocks", "letter_spacing")
