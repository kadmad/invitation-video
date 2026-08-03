"""Migrate template_fields to text_blocks

Revision ID: 003
Revises: 002
Create Date: 2024-01-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Get all templates with their fps for frame-to-second conversion
    templates = conn.execute(sa.text("SELECT id, fps FROM templates")).fetchall()
    fps_map = {str(t[0]): t[1] for t in templates}

    # Get all template fields
    fields = conn.execute(sa.text(
        "SELECT id, template_id, field_key, label, sort_order, "
        "position_x, position_y, max_width, font_size_ratio, text_color, text_align, "
        "animation_type, appear_frame, duration_frames "
        "FROM template_fields ORDER BY template_id, sort_order"
    )).fetchall()

    for field in fields:
        field_id = field[0]
        template_id = str(field[1])
        field_key = field[2]
        label = field[3]
        sort_order = field[4]
        position_x = field[5]
        position_y = field[6]
        max_width = field[7]
        font_size_ratio = field[8]
        text_color = field[9]
        text_align = field[10]
        animation_type = field[11]
        appear_frame = field[12]
        duration_frames = field[13]

        fps = fps_map.get(template_id, 30)
        start_time = appear_frame / fps
        end_time = (appear_frame + duration_frames) / fps

        # Content is just the tag wrapped in braces
        content = "{" + field_key + "}"

        # Tag config with label
        tag_config = '{"' + field_key + '": {"label": "' + label.replace('"', '\\"') + '"}}'

        conn.execute(sa.text(
            "INSERT INTO text_blocks (id, template_id, sort_order, content, "
            "position_x, position_y, max_width, font_size_ratio, text_color, text_align, "
            "animation_type, start_time, end_time, tag_config) "
            "VALUES (:id, :template_id, :sort_order, :content, "
            ":position_x, :position_y, :max_width, :font_size_ratio, :text_color, :text_align, "
            ":animation_type, :start_time, :end_time, CAST(:tag_config AS jsonb))"
        ), {
            "id": field_id,
            "template_id": field[1],
            "sort_order": sort_order,
            "content": content,
            "position_x": position_x,
            "position_y": position_y,
            "max_width": max_width,
            "font_size_ratio": font_size_ratio,
            "text_color": text_color,
            "text_align": text_align,
            "animation_type": animation_type,
            "start_time": start_time,
            "end_time": end_time,
            "tag_config": tag_config,
        })


def downgrade() -> None:
    # Delete migrated text blocks (they have same IDs as original fields)
    op.execute("DELETE FROM text_blocks WHERE id IN (SELECT id FROM template_fields)")
