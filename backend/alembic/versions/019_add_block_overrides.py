"""Add block_overrides to payments, render_jobs, user_drafts and editor_mode to user_drafts."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("payments", sa.Column("block_overrides", JSONB, nullable=True))
    op.add_column("render_jobs", sa.Column("block_overrides", JSONB, nullable=True))
    op.add_column("user_drafts", sa.Column("block_overrides", JSONB, nullable=True))
    op.add_column("user_drafts", sa.Column("editor_mode", sa.String(), nullable=True))


def downgrade():
    op.drop_column("user_drafts", "editor_mode")
    op.drop_column("user_drafts", "block_overrides")
    op.drop_column("render_jobs", "block_overrides")
    op.drop_column("payments", "block_overrides")
