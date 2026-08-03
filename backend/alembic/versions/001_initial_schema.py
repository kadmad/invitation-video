"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("is_admin", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Categories
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, index=True, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), default=0),
        sa.Column("is_active", sa.Boolean(), default=True),
    )

    # Fonts
    op.create_table(
        "fonts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("family_name", sa.String(100), nullable=False),
        sa.Column("language", sa.String(20), nullable=False),
        sa.Column("weight", sa.String(20), default="regular"),
        sa.Column("style", sa.String(20), default="normal"),
        sa.Column("file_key", sa.String(500), nullable=False),
        sa.Column("preview_text", sa.String(200), nullable=True),
    )

    # Templates
    op.create_table(
        "templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), unique=True, index=True, nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("video_key", sa.String(500), nullable=True),
        sa.Column("thumbnail_key", sa.String(500), nullable=True),
        sa.Column("duration_frames", sa.Integer(), default=300),
        sa.Column("fps", sa.Integer(), default=30),
        sa.Column("width", sa.Integer(), default=1080),
        sa.Column("height", sa.Integer(), default=1920),
        sa.Column("remotion_comp", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Template Fields
    op.create_table(
        "template_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_key", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("placeholder", sa.String(200), nullable=True),
        sa.Column("field_type", sa.String(20), default="text"),
        sa.Column("is_required", sa.Boolean(), default=True),
        sa.Column("sort_order", sa.Integer(), default=0),
        sa.Column("position_x", sa.Float(), default=0.5),
        sa.Column("position_y", sa.Float(), default=0.5),
        sa.Column("max_width", sa.Float(), default=0.8),
        sa.Column("font_size_ratio", sa.Float(), default=0.05),
        sa.Column("text_align", sa.String(10), default="center"),
        sa.Column("text_color", sa.String(20), default="#FFFFFF"),
        sa.Column("animation_type", sa.String(20), default="fade_in"),
        sa.Column("appear_frame", sa.Integer(), default=0),
        sa.Column("duration_frames", sa.Integer(), default=30),
    )

    # Render Jobs
    op.create_table(
        "render_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id"), nullable=False),
        sa.Column("font_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fonts.id"), nullable=False),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column("field_values", postgresql.JSONB(), default=dict),
        sa.Column("output_key", sa.String(500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("celery_task_id", sa.String(100), nullable=True),
        sa.Column("progress", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("render_jobs")
    op.drop_table("template_fields")
    op.drop_table("templates")
    op.drop_table("fonts")
    op.drop_table("categories")
    op.drop_table("users")
