"""Add default_text_color to templates, text_color_override to render_jobs

Revision ID: 005
Revises: 004
Create Date: 2024-01-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("templates", sa.Column("default_text_color", sa.String(20), server_default="#FFFFFF"))
    op.add_column("render_jobs", sa.Column("text_color_override", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("render_jobs", "text_color_override")
    op.drop_column("templates", "default_text_color")
