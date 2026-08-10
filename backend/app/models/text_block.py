import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class TextBlock(UUIDMixin, Base):
    __tablename__ = "text_blocks"

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id", ondelete="CASCADE")
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text)  # "Welcome {bride_name} and {groom_name}"

    # Position and styling (normalized 0-1)
    position_x: Mapped[float] = mapped_column(Float, default=0.5)
    position_y: Mapped[float] = mapped_column(Float, default=0.5)
    max_width: Mapped[float] = mapped_column(Float, default=0.8)

    # Font (per-block)
    font_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fonts.id"), nullable=True
    )
    font_size_ratio: Mapped[float] = mapped_column(Float, default=0.05)
    text_color: Mapped[str] = mapped_column(String(20), default="#FFFFFF")
    text_align: Mapped[str] = mapped_column(String(10), default="center")

    # Animation
    animation_type: Mapped[str] = mapped_column(
        String(30), default="fade_in"
    )  # entry animation
    animation_out: Mapped[str] = mapped_column(
        String(30), default="none"
    )  # exit animation
    anim_in_direction: Mapped[str] = mapped_column(String(5), default="ltr")  # ltr or rtl
    anim_out_direction: Mapped[str] = mapped_column(String(5), default="ltr")  # ltr or rtl
    anim_in_duration: Mapped[float] = mapped_column(Float, default=1.0)  # seconds
    anim_out_duration: Mapped[float] = mapped_column(Float, default=1.0)  # seconds
    start_time: Mapped[float] = mapped_column(Float, default=0.0)  # seconds
    end_time: Mapped[float] = mapped_column(Float, default=2.0)  # seconds

    # Tag validation config
    tag_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    format_ranges: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # e.g. {"bride_name": {"min_chars": 2, "max_chars": 30, "label": "Bride's Name"}}
    transliteration_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g. {"hello": "हैलो", "world": "वर्ल्ड"} — admin-selected transliteration per word

    template = relationship("Template", back_populates="text_blocks")
    font = relationship("Font")
