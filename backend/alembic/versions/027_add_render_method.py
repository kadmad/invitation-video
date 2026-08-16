"""Add render_method to render_jobs

Revision ID: 027
Revises: 026
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "027"
down_revision: Union[str, None] = "026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "render_jobs",
        sa.Column("render_method", sa.String(10), nullable=False, server_default="server"),
    )


def downgrade() -> None:
    op.drop_column("render_jobs", "render_method")
