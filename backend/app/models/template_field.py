import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class TemplateField(UUIDMixin, Base):
    __tablename__ = "template_fields"

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id", ondelete="CASCADE")
    )
    field_key: Mapped[str] = mapped_column(String(50))
    label: Mapped[str] = mapped_column(String(100))
    placeholder: Mapped[str | None] = mapped_column(String(200), nullable=True)
    field_type: Mapped[str] = mapped_column(String(20), default="text")  # text, date, time
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Position and styling (normalized 0-1)
    position_x: Mapped[float] = mapped_column(Float, default=0.5)
    position_y: Mapped[float] = mapped_column(Float, default=0.5)
    max_width: Mapped[float] = mapped_column(Float, default=0.8)
    font_size_ratio: Mapped[float] = mapped_column(Float, default=0.05)
    text_align: Mapped[str] = mapped_column(String(10), default="center")
    text_color: Mapped[str] = mapped_column(String(20), default="#FFFFFF")

    # Animation
    animation_type: Mapped[str] = mapped_column(
        String(20), default="fade_in"
    )  # fade_in, slide_up, typewriter, scale_pop
    appear_frame: Mapped[int] = mapped_column(Integer, default=0)
    duration_frames: Mapped[int] = mapped_column(Integer, default=30)

    template = relationship("Template", back_populates="fields")
