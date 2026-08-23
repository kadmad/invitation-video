import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, Sequence, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin

payment_order_number_seq = Sequence("payment_order_number_seq")


class Payment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    order_number: Mapped[int] = mapped_column(
        Integer,
        payment_order_number_seq,
        server_default=payment_order_number_seq.next_value(),
        unique=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    render_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("render_jobs.id"), nullable=True
    )
    razorpay_order_id: Mapped[str] = mapped_column(String(100), unique=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(500), nullable=True)
    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    status: Mapped[str] = mapped_column(
        String(20), default="created"
    )  # created, paid, failed, refunded
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id")
    )
    font_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fonts.id"), nullable=True
    )
    field_values: Mapped[dict] = mapped_column(JSONB, default=dict)
    text_color_override: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    block_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    block_format_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    location_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_watermarked: Mapped[bool] = mapped_column(Boolean, default=False)
    # Customer's own uploaded audio track (R2/S3 key), replacing the
    # template's original audio in the final render. None = keep original.
    music_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    music_start_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    user = relationship("User")
    render_job = relationship("RenderJob")
    template = relationship("Template")
    font = relationship("Font")
