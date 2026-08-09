import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class UserDraft(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "user_drafts"
    __table_args__ = (
        UniqueConstraint("user_id", "template_id", name="uq_user_template_draft"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id", ondelete="CASCADE")
    )
    font_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fonts.id"), nullable=True
    )
    field_values: Mapped[dict] = mapped_column(JSONB, default=dict)
    text_color_override: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    block_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    block_format_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    editor_mode: Mapped[str | None] = mapped_column(String, nullable=True)

    user = relationship("User")
    template = relationship("Template")
    font = relationship("Font")
