import uuid

from sqlalchemy import Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class AnalyticsEvent(UUIDMixin, TimestampMixin, Base):
    """One recorded interaction, from anywhere in the customer funnel.

    Deliberately first-party rather than another gtag event: the GA tag is
    stripped by ad blockers on a meaningful slice of traffic, and none of it
    is queryable next to our own templates/payments tables — which is the only
    way to ask "which template earns its preview views".

    Purchases are NOT recorded here. A Payment row already is the event, with
    its own status field, and duplicating it would let the two disagree. The
    funnel query joins to payments for its last two stages.
    """

    __tablename__ = "analytics_events"
    __table_args__ = (
        # The two shapes every dashboard query has: a time window over one
        # event type, and one template's whole funnel.
        Index("ix_analytics_events_event_created", "event", "created_at"),
        Index("ix_analytics_events_template_event", "template_id", "event"),
    )

    event: Mapped[str] = mapped_column(String(50), index=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id", ondelete="SET NULL"), nullable=True
    )
    # Null for a signed-out visitor, which is most of the funnel above
    # checkout. SET NULL rather than CASCADE so deleting a user doesn't
    # silently rewrite historical counts.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Client-generated, localStorage-backed. Survives sign-in, so a visitor
    # who converts can be counted once across the whole funnel. Not a
    # cross-site identifier and never leaves our own origin.
    anon_id: Mapped[str] = mapped_column(String(64), index=True)
    # Per-tab, sessionStorage-backed. Lets "10s of preview" be counted once
    # per visit instead of once per replay.
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Event-specific number, kept out of JSONB so it can be averaged in SQL:
    # seconds watched for preview_*, filled-field count for customization_*.
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    template = relationship("Template")
    user = relationship("User")
