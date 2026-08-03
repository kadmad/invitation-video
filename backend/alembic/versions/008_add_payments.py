"""Add payments table

Revision ID: 008
Revises: 007
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("render_job_id", UUID(as_uuid=True), sa.ForeignKey("render_jobs.id"), nullable=True),
        sa.Column("razorpay_order_id", sa.String(100), unique=True, nullable=False),
        sa.Column("razorpay_payment_id", sa.String(100), nullable=True),
        sa.Column("razorpay_signature", sa.String(500), nullable=True),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("currency", sa.String(10), server_default="INR"),
        sa.Column("status", sa.String(20), server_default="created"),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("templates.id"), nullable=False),
        sa.Column("font_id", UUID(as_uuid=True), sa.ForeignKey("fonts.id"), nullable=True),
        sa.Column("field_values", JSONB, server_default="{}"),
        sa.Column("text_color_override", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("payments")
