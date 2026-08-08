"""add format_ranges to text_blocks

Revision ID: 015
Revises: 014
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "015"
down_revision = "014"

def upgrade() -> None:
    op.add_column("text_blocks", sa.Column("format_ranges", JSONB, nullable=True))

def downgrade() -> None:
    op.drop_column("text_blocks", "format_ranges")
