"""First-party funnel event ingestion.

Open to signed-out visitors on purpose — most of the funnel happens before
anyone logs in, and a browse-to-editor drop-off is only visible if anonymous
traffic is counted. That makes this endpoint writable by the public, so it is
deliberately narrow: only known event names are stored, batches are capped,
and nothing free-text from the client reaches the database except a bounded
metadata blob.
"""
import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_optional, get_db
from app.models.analytics_event import AnalyticsEvent
from app.models.user import User

router = APIRouter()

# The funnel, in order. Anything not on this list is dropped rather than
# stored: an open ingestion endpoint with a free-form event name is an
# invitation to fill the table with junk, and an unknown name would never
# appear in the dashboard anyway.
KNOWN_EVENTS = {
    # Discovery
    "landing_view",
    "browse_view",
    "template_card_click",
    # Interest — how much of the preview actually got watched
    "preview_play",
    "preview_10s",
    "preview_complete",
    # Intent — the editor
    "editor_open",
    "customization_started",
    "customization_complete",
    "image_uploaded",
    "music_uploaded",
    "advanced_mode_opened",
    "share_link_copied",
    # Checkout
    "checkout_opened",
    "auth_wall_hit",
    "watermark_opted_in",
    "checkout_abandoned",
    # Delivery
    "render_status_viewed",
    "render_downloaded",
}

MAX_BATCH = 30
MAX_META_KEYS = 10


class EventIn(BaseModel):
    event: str = Field(max_length=50)
    template_id: uuid.UUID | None = None
    anon_id: str = Field(max_length=64)
    session_id: str | None = Field(default=None, max_length=64)
    value: float | None = None
    meta: dict | None = None


class EventBatch(BaseModel):
    events: list[EventIn] = Field(max_length=MAX_BATCH)


@router.post("/", status_code=202)
async def ingest_events(
    body: EventBatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    """Accept a batch of events. Always 202, even when every event in the
    batch is dropped — a tracking call must never surface an error to a
    customer mid-flow, and the client has nothing useful to do with one."""
    stored = 0
    for e in body.events:
        if e.event not in KNOWN_EVENTS or not e.anon_id:
            continue
        meta = None
        if e.meta:
            # Cap the shape, not just the size: a bounded number of keys with
            # scalar values only, so this can't become arbitrary client storage
            # on a publicly writable endpoint.
            meta = {}
            for k, v in list(e.meta.items())[:MAX_META_KEYS]:
                if not isinstance(v, (str, int, float, bool)):
                    continue
                meta[str(k)[:40]] = v[:200] if isinstance(v, str) else v
        db.add(
            AnalyticsEvent(
                event=e.event,
                template_id=e.template_id,
                user_id=user.id if user else None,
                anon_id=e.anon_id[:64],
                session_id=e.session_id[:64] if e.session_id else None,
                value=e.value,
                meta=meta or None,
            )
        )
        stored += 1

    if stored:
        await db.commit()
    return {"stored": stored}
