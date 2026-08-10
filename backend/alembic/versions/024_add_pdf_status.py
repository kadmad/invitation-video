"""Add pdf_status to render_jobs."""

from alembic import op
import sqlalchemy as sa

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("render_jobs", sa.Column("pdf_status", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("render_jobs", "pdf_status")
