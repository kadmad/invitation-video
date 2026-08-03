import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class Template(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "templates"

    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id")
    )
    video_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    thumbnail_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_frames: Mapped[int] = mapped_column(Integer, default=300)
    fps: Mapped[int] = mapped_column(Integer, default=30)
    width: Mapped[int] = mapped_column(Integer, default=1080)
    height: Mapped[int] = mapped_column(Integer, default=1920)
    remotion_comp: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    tag_labels: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    default_text_color: Mapped[str] = mapped_column(String(20), default="#FFFFFF")
    default_font_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fonts.id"), nullable=True
    )
    render_notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    category = relationship("Category", back_populates="templates")
    default_font = relationship("Font", foreign_keys=[default_font_id])
    text_blocks = relationship(
        "TextBlock", back_populates="template", cascade="all, delete-orphan",
        order_by="TextBlock.sort_order"
    )
    image_blocks = relationship(
        "ImageBlock", back_populates="template", cascade="all, delete-orphan",
        order_by="ImageBlock.sort_order"
    )
    render_jobs = relationship("RenderJob", back_populates="template")
