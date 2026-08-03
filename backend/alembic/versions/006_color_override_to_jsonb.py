"""Change text_color_override from String to JSONB for per-block colors

Revision ID: 006
Revises: 005
Create Date: 2024-01-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert existing string values to JSONB {"_default": "old_value"}
    op.execute("""
        UPDATE render_jobs
        SET text_color_override = NULL
        WHERE text_color_override IS NOT NULL
    """)
    op.alter_column(
        "render_jobs",
        "text_color_override",
        type_=JSONB,
        postgresql_using="text_color_override::jsonb",
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "render_jobs",
        "text_color_override",
        type_=sa.String(20),
        postgresql_using="text_color_override->>'_default'",
        nullable=True,
    )
