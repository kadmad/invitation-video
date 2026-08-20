import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class RenderJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "render_jobs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id")
    )
    font_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fonts.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, processing, completed, failed, cancelled (manual jobs only — admin-stopped)
    field_values: Mapped[dict] = mapped_column(JSONB, default=dict)
    output_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    text_color_override: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    block_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    block_format_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    pdf_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pdf_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    location_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # "server" = normal auto-rendered pipeline. "manual" = SERVER_RENDERING was
    # off when this was paid for; an admin renders it locally and uploads the
    # result. Editable by the owning user only while manual + still "pending" —
    # locked the moment an admin claims it (status -> "processing").
    render_method: Mapped[str] = mapped_column(String(10), default="server")
    is_watermarked: Mapped[bool] = mapped_column(Boolean, default=False)

    user = relationship("User", back_populates="render_jobs")
    template = relationship("Template", back_populates="render_jobs")
    font = relationship("Font")
