"""Add price column to templates"""

from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("templates", sa.Column("price", sa.Integer(), nullable=False, server_default="9900"))


def downgrade():
    op.drop_column("templates", "price")
