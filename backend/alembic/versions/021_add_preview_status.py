"""Add preview_status to templates table."""

from alembic import op
import sqlalchemy as sa

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("templates", sa.Column("preview_status", sa.String(50), nullable=True))


def downgrade():
    op.drop_column("templates", "preview_status")
