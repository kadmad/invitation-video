"""add render_notes to templates

Revision ID: 014
Revises: 013
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"

def upgrade() -> None:
    op.add_column("templates", sa.Column("render_notes", sa.String(1000), nullable=True))

def downgrade() -> None:
    op.drop_column("templates", "render_notes")
