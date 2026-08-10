"""Add transliteration_overrides to text_blocks table."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("text_blocks", sa.Column("transliteration_overrides", JSONB, nullable=True))


def downgrade():
    op.drop_column("text_blocks", "transliteration_overrides")
