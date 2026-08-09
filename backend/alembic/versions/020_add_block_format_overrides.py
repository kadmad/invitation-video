"""Add block_format_overrides to payments, render_jobs, user_drafts."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("payments", sa.Column("block_format_overrides", JSONB, nullable=True))
    op.add_column("render_jobs", sa.Column("block_format_overrides", JSONB, nullable=True))
    op.add_column("user_drafts", sa.Column("block_format_overrides", JSONB, nullable=True))


def downgrade():
    op.drop_column("user_drafts", "block_format_overrides")
    op.drop_column("render_jobs", "block_format_overrides")
    op.drop_column("payments", "block_format_overrides")
