"""Add per-char animation direction fields to text_blocks."""

from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("text_blocks", sa.Column("anim_in_direction", sa.String(5), server_default="ltr", nullable=False))
    op.add_column("text_blocks", sa.Column("anim_out_direction", sa.String(5), server_default="ltr", nullable=False))


def downgrade():
    op.drop_column("text_blocks", "anim_out_direction")
    op.drop_column("text_blocks", "anim_in_direction")
