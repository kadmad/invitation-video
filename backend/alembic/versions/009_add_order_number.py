"""Add order_number to payments

Revision ID: 009
Revises: 008
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE payment_order_number_seq")
    op.add_column(
        "payments",
        sa.Column(
            "order_number",
            sa.Integer,
            server_default=sa.text("nextval('payment_order_number_seq')"),
            unique=True,
        ),
    )
    # Backfill existing rows
    op.execute(
        "UPDATE payments SET order_number = nextval('payment_order_number_seq') WHERE order_number IS NULL"
    )
    op.alter_column("payments", "order_number", nullable=False)


def downgrade() -> None:
    op.drop_column("payments", "order_number")
    op.execute("DROP SEQUENCE payment_order_number_seq")
