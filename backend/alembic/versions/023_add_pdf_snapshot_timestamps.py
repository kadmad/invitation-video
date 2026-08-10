"""Add PDF generation fields: pdf_snapshot_timestamps on templates,
pdf_key and location_url on render_jobs, location_url on payments."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade():
    # Template: admin-configured timestamps for PDF snapshots
    op.add_column("templates", sa.Column("pdf_snapshot_timestamps", JSONB, nullable=True))

    # RenderJob: generated PDF key + user-supplied location URL
    op.add_column("render_jobs", sa.Column("pdf_key", sa.String(500), nullable=True))
    op.add_column("render_jobs", sa.Column("location_url", sa.String(1000), nullable=True))

    # Payment: pass location_url through payment flow
    op.add_column("payments", sa.Column("location_url", sa.String(1000), nullable=True))


def downgrade():
    op.drop_column("payments", "location_url")
    op.drop_column("render_jobs", "location_url")
    op.drop_column("render_jobs", "pdf_key")
    op.drop_column("templates", "pdf_snapshot_timestamps")
