"""Add seo_description to templates

Revision ID: 031
Revises: 030
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "031"
down_revision: Union[str, None] = "030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("templates", sa.Column("seo_description", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("templates", "seo_description")
