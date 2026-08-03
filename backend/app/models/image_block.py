import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class ImageBlock(UUIDMixin, Base):
    __tablename__ = "image_blocks"

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id", ondelete="CASCADE")
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    label: Mapped[str] = mapped_column(String(200), default="Photo")

    # Position and size (normalized 0-1)
    position_x: Mapped[float] = mapped_column(Float, default=0.5)
    position_y: Mapped[float] = mapped_column(Float, default=0.5)
    width: Mapped[float] = mapped_column(Float, default=0.3)
    height: Mapped[float] = mapped_column(Float, default=0.3)

    # Shape mask
    mask_shape: Mapped[str] = mapped_column(String(20), default="none")
    # "none", "circle", "oval", "rounded_rect", "heart", "diamond", "hexagon", "arch", "star"
    mask_feather: Mapped[float] = mapped_column(Float, default=0.0)  # 0-50 blur px

    # Decorative frame overlay
    frame_image_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Ken Burns animation
    ken_burns_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ken_burns_zoom: Mapped[float] = mapped_column(Float, default=1.2)  # 1.0-1.5
    ken_burns_direction: Mapped[str] = mapped_column(String(20), default="zoom_in")
    # "zoom_in", "zoom_out", "pan_left", "pan_right"

    # Display
    opacity: Mapped[float] = mapped_column(Float, default=1.0)
    animation_type: Mapped[str] = mapped_column(String(20), default="none")
    # "none", "fade_in", "scale_in"

    # Timing
    start_time: Mapped[float] = mapped_column(Float, default=0.0)
    end_time: Mapped[float] = mapped_column(Float, default=3.0)

    # Placeholder / user upload
    placeholder_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_user_uploadable: Mapped[bool] = mapped_column(Boolean, default=True)

    template = relationship("Template", back_populates="image_blocks")
