"""Add preview_key to templates for pre-rendered preview video."""

from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("templates", sa.Column("preview_key", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("templates", "preview_key")
