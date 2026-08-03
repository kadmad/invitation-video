"""Add animation_out, anim_in_duration, anim_out_duration to text_blocks"""

from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("text_blocks", sa.Column("animation_out", sa.String(30), server_default="none", nullable=False))
    op.add_column("text_blocks", sa.Column("anim_in_duration", sa.Float(), server_default="1.0", nullable=False))
    op.add_column("text_blocks", sa.Column("anim_out_duration", sa.Float(), server_default="1.0", nullable=False))


def downgrade() -> None:
    op.drop_column("text_blocks", "anim_out_duration")
    op.drop_column("text_blocks", "anim_in_duration")
    op.drop_column("text_blocks", "animation_out")
