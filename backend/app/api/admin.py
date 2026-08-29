import logging
import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from sqlalchemy import String, cast, distinct, select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import prod_async_session
from app.dependencies import get_admin_user, get_db
from app.models.category import Category
from app.models.font import Font
from app.models.analytics_event import AnalyticsEvent
from app.models.template import Template
from app.models.text_block import TextBlock
from app.models.image_block import ImageBlock
from app.models.render_job import RenderJob
from app.models.payment import Payment
from app.models.user import User
from app.schemas.admin import (
    AdminCategoryCreate,
    AdminCategoryUpdate,
    AdminCategoryResponse,
    AdminTemplateCreate,
    AdminTemplateUpdate,
    AdminTemplateListResponse,
    AdminTemplateDetailResponse,
    TextBlockCreate,
    TextBlockUpdate,
    TextBlockResponse,
    AEImportRequest,
    AEImportPreviewLayer,
    AEImportPreviewResponse,
    AwaitingRenderResponse,
    AwaitingRendersListResponse,
    ImageBlockCreate,
    ImageBlockUpdate,
    ImageBlockResponse,
    AnalyticsSummary,
    TemplateAnalyticsRow,
    PeriodData,
)
from app.schemas.font import FontResponse
from app.services.storage_service import storage_service, prod_storage_service
from app.utils.orders import format_order_number
from app.services import whatsapp_service
from app.workers.celery_app import celery_app
from app.workers.prod_celery import prod_celery_app
from app.workers.tasks import render_video_task

logger = logging.getLogger(__name__)

router = APIRouter()


def _queue_preview(template: Template):
    """Queue preview video re-render if template has source video."""
    if template.video_key:
        from app.workers.tasks import render_preview_task
        render_preview_task.delay(str(template.id))


# --- Dashboard ---

@router.get("/stats")
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    templates_count = (await db.execute(select(func.count(Template.id)))).scalar()
    categories_count = (await db.execute(select(func.count(Category.id)))).scalar()
    users_count = (await db.execute(select(func.count(User.id)))).scalar()
    renders_count = (await db.execute(select(func.count(RenderJob.id)))).scalar()
    return {
        "templates": templates_count,
        "categories": categories_count,
        "users": users_count,
        "renders": renders_count,
    }


# --- Analytics ---

def _period_cols(label: str, start: datetime, end: datetime, prev_start: datetime, prev_end: datetime):
    """Build SQLAlchemy aggregation columns for a period + its previous comparison window."""
    paid = Payment.status == "paid"
    return [
        func.count(Payment.id).filter(
            and_(paid, Payment.created_at >= start, Payment.created_at < end)
        ).label(f"{label}_purchases"),
        func.coalesce(func.sum(Payment.amount).filter(
            and_(paid, Payment.created_at >= start, Payment.created_at < end)
        ), 0).label(f"{label}_revenue"),
        func.count(Payment.id).filter(
            and_(paid, Payment.created_at >= prev_start, Payment.created_at < prev_end)
        ).label(f"{label}_prev_purchases"),
        func.coalesce(func.sum(Payment.amount).filter(
            and_(paid, Payment.created_at >= prev_start, Payment.created_at < prev_end)
        ), 0).label(f"{label}_prev_revenue"),
    ]


def _actor():
    """One human, however we know them. A signed-in user counts once even if
    they browsed anonymously first (the anon id is kept through sign-in on the
    client); a signed-out visitor counts as their anon id. This is what every
    "how many people" number on the funnel dashboard is built from."""
    return func.coalesce(cast(AnalyticsEvent.user_id, String), AnalyticsEvent.anon_id)


def _actors_in(event: str, since: datetime):
    return func.count(distinct(_actor())).filter(
        and_(AnalyticsEvent.event == event, AnalyticsEvent.created_at >= since)
    )


# The funnel, in the order a customer walks it. Each stage is counted in
# distinct people, not raw hits — ten replays of one preview is one interested
# visitor, and counting hits would make the top of the funnel look wider than
# it is.
_FUNNEL_STAGES = [
    ("landing_view", "Landed on the site"),
    ("browse_view", "Browsed templates"),
    ("template_card_click", "Opened a template"),
    ("preview_play", "Started a preview"),
    ("preview_10s", "Watched 10s+ of a preview"),
    ("editor_open", "Opened the editor"),
    ("customization_started", "Started typing their details"),
    ("customization_complete", "Filled in every field"),
    ("checkout_opened", "Reached checkout"),
]


@router.get("/analytics/funnel")
async def funnel_analytics(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    """Pre-purchase funnel: what people did before (and instead of) paying.

    The revenue dashboard next door only sees completed purchases, which
    cannot answer "which template is worth advertising" — a template with a
    hundred 10-second previews and two sales is a different problem from one
    with two previews and two sales, and they look identical in revenue.
    """
    days = max(1, min(days, 365))
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # --- Stage totals, distinct people per stage ---
    stage_cols = [_actors_in(ev, since).label(ev) for ev, _ in _FUNNEL_STAGES]
    row = (await db.execute(select(*stage_cols))).one()

    funnel = [
        {"event": ev, "label": label, "actors": getattr(row, ev) or 0}
        for ev, label in _FUNNEL_STAGES
    ]

    # --- Purchases come from payments, never from events ---
    # A Payment row IS the order; recording a duplicate event would let the
    # two drift apart and there would be no way to tell which was right.
    pay_row = (await db.execute(
        select(
            func.count(Payment.id).filter(Payment.created_at >= since).label("orders"),
            func.count(Payment.id).filter(
                and_(Payment.status == "paid", Payment.created_at >= since)
            ).label("paid"),
            func.count(Payment.id).filter(
                and_(Payment.status == "created", Payment.created_at >= since)
            ).label("unpaid"),
            func.coalesce(func.sum(Payment.amount).filter(
                and_(Payment.status == "created", Payment.created_at >= since)
            ), 0).label("unpaid_value"),
            func.count(distinct(Payment.user_id)).filter(
                and_(Payment.status == "paid", Payment.created_at >= since)
            ).label("paying_customers"),
        )
    )).one()

    funnel.append({"event": "order_created", "label": "Started payment", "actors": pay_row.orders or 0})
    funnel.append({"event": "payment_paid", "label": "Paid", "actors": pay_row.paid or 0})

    # Percentages come last, against the widest stage rather than the first
    # one. The first stage can legitimately be zero — traffic arriving straight
    # on a shared /editor link, or a page not instrumented yet — and anchoring
    # on it would render the whole funnel as 0%, or as several hundred percent
    # for the stages below it.
    top = max((stage["actors"] for stage in funnel), default=0)
    for stage in funnel:
        stage["pct_of_top"] = round(stage["actors"] / top * 100, 1) if top else 0.0

    # --- The two questions worth acting on ---
    # People who typed in everything and then stopped: highest-intent traffic
    # on the site, and the cheapest to win back.
    completed = select(distinct(_actor())).where(
        and_(AnalyticsEvent.event == "customization_complete", AnalyticsEvent.created_at >= since)
    )
    reached_checkout = select(distinct(_actor())).where(
        and_(AnalyticsEvent.event == "checkout_opened", AnalyticsEvent.created_at >= since)
    )
    stalled_before_checkout = (await db.execute(
        select(func.count()).select_from(
            completed.except_(reached_checkout).subquery()
        )
    )).scalar_one()

    # Hit the login wall and never came back — a signup-friction number, not a
    # pricing one, and it needs a different fix from the row above.
    hit_auth_wall = select(distinct(_actor())).where(
        and_(AnalyticsEvent.event == "auth_wall_hit", AnalyticsEvent.created_at >= since)
    )
    stalled_at_auth = (await db.execute(
        select(func.count()).select_from(
            hit_auth_wall.except_(reached_checkout).subquery()
        )
    )).scalar_one()

    drop_offs = {
        # Filled the form, never opened checkout.
        "filled_in_but_no_checkout": stalled_before_checkout,
        # Got as far as the login wall and stopped there.
        "blocked_at_login": stalled_at_auth,
        # Razorpay order created, money never arrived. Exact, from payments.
        "ordered_but_unpaid": pay_row.unpaid or 0,
        "ordered_but_unpaid_value": pay_row.unpaid_value or 0,
    }

    # --- Per template ---
    ev_cols = [
        func.count(distinct(_actor())).filter(AnalyticsEvent.event == ev).label(ev)
        for ev in ("template_card_click", "preview_play", "preview_10s", "editor_open",
                   "customization_started", "customization_complete", "checkout_opened")
    ]
    tmpl_events = (await db.execute(
        select(AnalyticsEvent.template_id, *ev_cols)
        .where(and_(AnalyticsEvent.created_at >= since, AnalyticsEvent.template_id.isnot(None)))
        .group_by(AnalyticsEvent.template_id)
    )).all()
    by_template = {r.template_id: r for r in tmpl_events}

    tmpl_pay = (await db.execute(
        select(
            Payment.template_id,
            func.count(Payment.id).filter(Payment.created_at >= since).label("orders"),
            func.count(Payment.id).filter(
                and_(Payment.status == "paid", Payment.created_at >= since)
            ).label("paid"),
            func.coalesce(func.sum(Payment.amount).filter(
                and_(Payment.status == "paid", Payment.created_at >= since)
            ), 0).label("revenue"),
        ).group_by(Payment.template_id)
    )).all()
    pay_by_template = {r.template_id: r for r in tmpl_pay}

    templates = (await db.execute(
        select(Template.id, Template.name, Template.slug, Template.is_published)
    )).all()

    rows = []
    for t in templates:
        e = by_template.get(t.id)
        p = pay_by_template.get(t.id)
        watched = (e.preview_10s if e else 0) or 0
        opened = (e.editor_open if e else 0) or 0
        filled = (e.customization_complete if e else 0) or 0
        paid = (p.paid if p else 0) or 0
        rows.append({
            "template_id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "is_published": t.is_published,
            "card_clicks": (e.template_card_click if e else 0) or 0,
            "preview_plays": (e.preview_play if e else 0) or 0,
            "preview_10s": watched,
            "editor_opens": opened,
            "customization_started": (e.customization_started if e else 0) or 0,
            "customization_complete": filled,
            "checkout_opened": (e.checkout_opened if e else 0) or 0,
            "orders": (p.orders if p else 0) or 0,
            "paid": paid,
            "revenue": (p.revenue if p else 0) or 0,
            # Of the people who watched enough preview to have an opinion, how
            # many opened the editor. This is the "is the template itself
            # working" number, isolated from how much traffic it got.
            "watch_to_edit_pct": round(opened / watched * 100, 1) if watched else None,
            # Of those who watched it properly, how many bought. This is the
            # number to rank ad spend by.
            "watch_to_paid_pct": round(paid / watched * 100, 1) if watched else None,
        })

    rows.sort(key=lambda r: (r["preview_10s"], r["paid"]), reverse=True)

    return {
        "days": days,
        "funnel": funnel,
        "drop_offs": drop_offs,
        "paying_customers": pay_row.paying_customers or 0,
        "templates": rows,
    }


@router.get("/analytics", response_model=AnalyticsSummary)
async def template_analytics(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    now = datetime.now(timezone.utc)
    far_past = datetime(2000, 1, 1, tzinfo=timezone.utc)

    # Define periods: (label, start, end, prev_start, prev_end)
    this_year_start = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    last_year_start = datetime(now.year - 1, 1, 1, tzinfo=timezone.utc)

    periods = {
        "p7":   (now - timedelta(days=7),   now, now - timedelta(days=14),  now - timedelta(days=7)),
        "p30":  (now - timedelta(days=30),  now, now - timedelta(days=60),  now - timedelta(days=30)),
        "p90":  (now - timedelta(days=90),  now, now - timedelta(days=180), now - timedelta(days=90)),
        "p365": (now - timedelta(days=365), now, now - timedelta(days=730), now - timedelta(days=365)),
        "pty":  (this_year_start,           now, last_year_start,           this_year_start),
        "ply":  (last_year_start,           this_year_start, datetime(now.year - 2, 1, 1, tzinfo=timezone.utc), last_year_start),
    }

    # Build all aggregation columns
    extra_cols = []
    for label, (s, e, ps, pe) in periods.items():
        extra_cols.extend(_period_cols(label, s, e, ps, pe))

    query = (
        select(
            Template.id,
            Template.name,
            Template.slug,
            Template.created_at,
            func.count(Payment.id).filter(Payment.status == "paid").label("total_purchases"),
            func.coalesce(func.sum(Payment.amount).filter(Payment.status == "paid"), 0).label("total_revenue"),
            *extra_cols,
        )
        .outerjoin(Payment, Payment.template_id == Template.id)
        .group_by(Template.id)
        .order_by(func.count(Payment.id).filter(Payment.status == "paid").desc())
    )

    result = await db.execute(query)
    rows = result.all()

    def make_period(row, label: str) -> PeriodData:
        return PeriodData(
            purchases=getattr(row, f"{label}_purchases"),
            revenue=getattr(row, f"{label}_revenue"),
            prev_purchases=getattr(row, f"{label}_prev_purchases"),
            prev_revenue=getattr(row, f"{label}_prev_revenue"),
        )

    def sum_periods(templates_list: list, label: str) -> PeriodData:
        return PeriodData(
            purchases=sum(getattr(t, label).purchases for t in templates_list),
            revenue=sum(getattr(t, label).revenue for t in templates_list),
            prev_purchases=sum(getattr(t, label).prev_purchases for t in templates_list),
            prev_revenue=sum(getattr(t, label).prev_revenue for t in templates_list),
        )

    templates = []
    grand_total_revenue = 0
    grand_total_purchases = 0
    top_template_name = None
    top_count = 0

    for row in rows:
        t = TemplateAnalyticsRow(
            template_id=row.id,
            template_name=row.name,
            slug=row.slug,
            created_by=None,
            created_at=row.created_at,
            total_purchases=row.total_purchases,
            total_revenue=row.total_revenue,
            p_7d=make_period(row, "p7"),
            p_30d=make_period(row, "p30"),
            p_90d=make_period(row, "p90"),
            p_365d=make_period(row, "p365"),
            p_this_year=make_period(row, "pty"),
            p_last_year=make_period(row, "ply"),
        )
        templates.append(t)
        grand_total_revenue += row.total_revenue
        grand_total_purchases += row.total_purchases
        if row.total_purchases > top_count:
            top_count = row.total_purchases
            top_template_name = row.name

    return AnalyticsSummary(
        total_revenue=grand_total_revenue,
        total_purchases=grand_total_purchases,
        s_7d=sum_periods(templates, "p_7d"),
        s_30d=sum_periods(templates, "p_30d"),
        s_90d=sum_periods(templates, "p_90d"),
        s_365d=sum_periods(templates, "p_365d"),
        s_this_year=sum_periods(templates, "p_this_year"),
        s_last_year=sum_periods(templates, "p_last_year"),
        top_template_name=top_template_name,
        templates=templates,
    )


# --- Categories ---

@router.get("/categories", response_model=list[AdminCategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Category).order_by(Category.sort_order))
    return result.scalars().all()


@router.post("/categories", response_model=AdminCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: AdminCategoryCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    category = Category(**body.model_dump())
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.put("/categories/{category_id}", response_model=AdminCategoryResponse)
async def update_category(
    category_id: uuid.UUID,
    body: AdminCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category.is_active = False
    await db.commit()
    return {"status": "deleted"}


# --- Templates ---

@router.get("/templates", response_model=list[AdminTemplateListResponse])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Template).order_by(Template.created_at.desc()))
    return result.scalars().all()


@router.post("/templates", response_model=AdminTemplateDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: AdminTemplateCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    template = Template(**body.model_dump())
    db.add(template)
    await db.commit()
    result = await db.execute(
        select(Template)
        .options(selectinload(Template.text_blocks), selectinload(Template.image_blocks))
        .where(Template.id == template.id)
    )
    return result.scalar_one()


@router.get("/templates/{template_id}", response_model=AdminTemplateDetailResponse)
async def get_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(
        select(Template)
        .options(selectinload(Template.text_blocks), selectinload(Template.image_blocks))
        .where(Template.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/templates/{template_id}", response_model=AdminTemplateDetailResponse)
async def update_template(
    template_id: uuid.UUID,
    body: AdminTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(
        select(Template)
        .options(selectinload(Template.text_blocks), selectinload(Template.image_blocks))
        .where(Template.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    should_render = body.render_preview
    update_data = body.model_dump(exclude_unset=True, exclude={"render_preview"})
    # These two are baked into the preview MP4, so changing either leaves the
    # preview playing the wrong mix. Re-render on change rather than trusting
    # whoever moved the slider to also tick Render.
    music_mix_changed = any(
        key in update_data and update_data[key] != getattr(template, key)
        for key in ("music_start_seconds", "music_volume")
    )
    for key, value in update_data.items():
        setattr(template, key, value)
    if music_mix_changed and template.music_key:
        should_render = True
    if template.is_published:
        if not template.price:
            raise HTTPException(status_code=400, detail="Price must be set before publishing")
        if not template.discount_amount_paise:
            raise HTTPException(status_code=400, detail="Watermark discount must be set before publishing")
        if template.discount_amount_paise >= template.price:
            raise HTTPException(status_code=400, detail="Discount must be less than price")
    if should_render:
        template.preview_status = "processing"
    await db.commit()
    await db.refresh(template)
    if should_render:
        _queue_preview(template)
    return template


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # render_jobs.template_id and payments.template_id are NOT NULL with no
    # ON DELETE rule, so deleting a template that has orders made SQLAlchemy
    # try to null those columns out — a NotNullViolation surfacing as a bare
    # 500. Cascading instead would be worse: it would erase paid orders and
    # the customer's ability to re-download what they bought. Refuse with an
    # explanation and point the admin at unpublishing, which is what they
    # actually want (hide it from the storefront, keep history intact).
    renders = await db.scalar(
        select(func.count()).select_from(RenderJob).where(RenderJob.template_id == template_id)
    )
    orders = await db.scalar(
        select(func.count()).select_from(Payment).where(Payment.template_id == template_id)
    )
    if renders or orders:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Can't delete \"{template.name}\" — it has {orders} order(s) and "
                f"{renders} render(s) attached, and deleting it would destroy that "
                f"purchase history. Unpublish it instead to hide it from customers."
            ),
        )

    await db.delete(template)
    await db.commit()
    return {"status": "deleted"}


@router.post("/templates/{template_id}/upload-video")
async def upload_template_video(
    template_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    video_key = f"templates/{template.slug}/source.mp4"
    data = await file.read()
    storage_service.upload(video_key, data, content_type="video/mp4")

    template.video_key = video_key

    # Write to temp file for ffprobe/ffmpeg processing
    thumb_key = None
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_video:
        tmp_video.write(data)
        tmp_video.flush()
        thumb_path = tmp_video.name.replace(".mp4", ".webp")

    try:
        # Probe video duration, fps, and dimensions
        probe_result = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_streams", "-show_format", tmp_video.name,
            ],
            capture_output=True, text=True,
        )
        probe_info = json.loads(probe_result.stdout)
        for stream in probe_info.get("streams", []):
            if stream.get("codec_type") == "video":
                # Duration from stream or container
                duration = float(
                    stream.get("duration")
                    or probe_info.get("format", {}).get("duration", "10")
                )
                # FPS from r_frame_rate (e.g. "30/1")
                r_fps = stream.get("r_frame_rate", "30/1")
                num, den = r_fps.split("/")
                fps = round(int(num) / int(den))
                fps = max(1, min(fps, 120))

                template.duration_frames = round(duration * fps)
                template.fps = fps
                template.width = int(stream.get("width", template.width))
                template.height = int(stream.get("height", template.height))
                break
    except Exception as exc:
        print(f"[probe] ffprobe duration read failed: {exc}")

    try:
        # Generate WebP thumbnail from first frame
        subprocess.run(
            [
                "ffmpeg", "-i", tmp_video.name,
                "-vframes", "1", "-q:v", "80",
                "-vf", "scale='min(720,iw)':-2",
                thumb_path, "-y",
            ],
            check=True,
            capture_output=True,
        )
        thumb_data = open(thumb_path, "rb").read()
        thumb_key = f"templates/{template.slug}/thumb.webp"
        storage_service.upload(thumb_key, thumb_data, content_type="image/webp")
        template.thumbnail_key = thumb_key
    except Exception as exc:
        print(f"[thumbnail] ffmpeg failed: {exc}")
    finally:
        os.unlink(tmp_video.name)
        if os.path.exists(thumb_path):
            os.unlink(thumb_path)

    await db.commit()
    return {
        "video_key": video_key,
        "thumbnail_key": thumb_key,
        "duration_frames": template.duration_frames,
        "fps": template.fps,
        "width": template.width,
        "height": template.height,
    }


@router.get("/templates/{template_id}/video-url")
async def get_template_video_url(
    template_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.video_key:
        raise HTTPException(status_code=400, detail="No video uploaded")

    url = storage_service.presigned_url(template.video_key, public_host=request.url.hostname)
    return {"url": url}


# --- Template Music ---

@router.post("/templates/{template_id}/upload-music")
async def upload_template_music(
    template_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    """Replace the template's soundtrack. Independent of the source video, so
    an admin can re-score a template without re-uploading (and re-probing, and
    re-thumbnailing) the video. Uploading again overwrites the previous track:
    the newest upload is what customers hear by default."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    data = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower() or ".mp3"
    if ext not in {".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus", ".flac"}:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    with tempfile.NamedTemporaryFile(suffix=ext) as tmp_audio:
        tmp_audio.write(data)
        tmp_audio.flush()
        probe_result = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_streams", "-show_format", tmp_audio.name,
            ],
            capture_output=True, text=True,
        )
        try:
            probe_info = json.loads(probe_result.stdout)
            duration = float(probe_info.get("format", {}).get("duration", 0))
        except (ValueError, json.JSONDecodeError):
            duration = 0

    if duration <= 0:
        raise HTTPException(status_code=400, detail="Couldn't read that audio file")

    # Timestamped key rather than a fixed name: CDN/browser caches key off the
    # URL, and a fixed "music.mp3" would keep serving the old track after a
    # replacement (the same reason preview_key carries a timestamp).
    music_key = f"templates/{template.slug}/music_{int(time.time())}{ext}"
    storage_service.upload(music_key, data, content_type=file.content_type or "audio/mpeg")

    old_key = template.music_key
    template.music_key = music_key
    template.music_start_seconds = 0.0  # a new track invalidates the old offset
    # The preview is a rendered MP4 with the audio baked in, and it is what
    # browse cards play and what a shared link shows. Leaving it stale meant
    # the whole site kept playing the *old* soundtrack until someone
    # remembered to tick Render and Save — so rebuild it automatically.
    template.preview_status = "processing"
    await db.commit()
    _queue_preview(template)

    if old_key and old_key != music_key:
        try:
            storage_service.delete(old_key)
        except Exception as exc:  # a stale object is harmless, a 500 here isn't
            print(f"[music] failed to delete replaced track {old_key}: {exc}")

    return {"music_key": music_key, "duration_seconds": duration}


@router.delete("/templates/{template_id}/music")
async def delete_template_music(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    """Drop the soundtrack — the template falls back to the source video's own
    audio, which is what it used before any music was ever attached."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    old_key = template.music_key
    template.music_key = None
    template.music_start_seconds = 0.0
    # Same reason as upload: the baked-in preview would otherwise keep playing
    # a soundtrack the template no longer has.
    template.preview_status = "processing"
    await db.commit()
    _queue_preview(template)

    if old_key:
        try:
            storage_service.delete(old_key)
        except Exception as exc:
            print(f"[music] failed to delete {old_key}: {exc}")

    return {"ok": True}


# --- Text Blocks ---

@router.post("/templates/{template_id}/text-blocks", response_model=TextBlockResponse, status_code=status.HTTP_201_CREATED)
async def create_text_block(
    template_id: uuid.UUID,
    body: TextBlockCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Template).where(Template.id == template_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Template not found")

    block = TextBlock(template_id=template_id, **body.model_dump())
    db.add(block)
    await db.commit()
    await db.refresh(block)
    return block


@router.put("/templates/{template_id}/text-blocks/{block_id}", response_model=TextBlockResponse)
async def update_text_block(
    template_id: uuid.UUID,
    block_id: uuid.UUID,
    body: TextBlockUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(
        select(TextBlock).where(TextBlock.id == block_id, TextBlock.template_id == template_id)
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Text block not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(block, key, value)
    await db.commit()
    await db.refresh(block)
    return block


@router.delete("/templates/{template_id}/text-blocks/{block_id}")
async def delete_text_block(
    template_id: uuid.UUID,
    block_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(
        select(TextBlock).where(TextBlock.id == block_id, TextBlock.template_id == template_id)
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Text block not found")
    await db.delete(block)
    await db.commit()
    return {"status": "deleted"}


_AE_STYLE_SUFFIXES = (
    "extrabolditalic", "extrabold", "semibolditalic", "semibold",
    "bolditalic", "bold", "mediumitalic", "medium", "lightitalic", "light",
    "thinitalic", "thin", "blackitalic", "black", "italic", "oblique",
    "regular",
)


def _ae_font_family_guess(ps_name: str) -> str:
    """Best-effort PostScript name -> family name, e.g.
    "PlayfairDisplay-BoldItalic" -> "Playfair Display"."""
    name = ps_name.replace("_", "-")
    base = name.split("-")[0] if "-" in name else name

    # If no hyphen, the style suffix (if any) is usually just appended in
    # CamelCase, e.g. "MontserratBold" — strip a known suffix off the end.
    if "-" not in name:
        lower = base.lower()
        for suf in _AE_STYLE_SUFFIXES:
            if lower.endswith(suf) and len(lower) > len(suf):
                base = base[: len(base) - len(suf)]
                break

    # CamelCase -> spaced words: "PlayfairDisplay" -> "Playfair Display"
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", base)
    spaced = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", spaced)
    return spaced.strip()


async def _match_ae_font(font_ps_name: str, db: AsyncSession) -> Font | None:
    """Fuzzy-match an After Effects PostScript font name against our fonts
    table by family name. Best-effort only — admin reviews/overrides in the
    import preview before anything is created."""
    guess = _ae_font_family_guess(font_ps_name)
    if not guess:
        return None

    result = await db.execute(select(Font).where(func.lower(Font.family_name) == guess.lower()))
    match = result.scalars().first()
    if match:
        return match

    result = await db.execute(select(Font).where(Font.family_name.ilike(f"%{guess}%")))
    return result.scalars().first()


@router.post("/templates/{template_id}/text-blocks/import-ae", response_model=AEImportPreviewResponse)
async def preview_ae_import(
    template_id: uuid.UUID,
    body: AEImportRequest,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    """Analyze an After Effects layout export and propose text_blocks from
    it (font, position, start/stop time — no animation). Nothing is created
    yet; the admin reviews this preview and confirms via the normal
    create_text_block calls for whichever rows they accept."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Template not found")

    if body.comp_width <= 0 or body.comp_height <= 0:
        raise HTTPException(status_code=400, detail="Invalid comp dimensions in export file")

    hex_color_re = re.compile(r"^#[0-9a-fA-F]{6}$")

    preview_layers = []
    for layer in body.layers:
        matched = await _match_ae_font(layer.font, db)
        color = layer.color if layer.color and hex_color_re.match(layer.color) else None
        preview_layers.append(
            AEImportPreviewLayer(
                name=layer.name,
                text=layer.text.strip() if layer.text and layer.text.strip() else None,
                requested_font=layer.font,
                matched_font_id=matched.id if matched else None,
                matched_font_name=matched.name if matched else None,
                color=color,
                position_x=round(layer.x / body.comp_width, 4),
                position_y=round(layer.y / body.comp_height, 4),
                font_size_ratio=round(layer.font_size / body.comp_height, 4),
                start_time=round(layer.in_point, 2),
                end_time=round(layer.out, 2),
            )
        )

    return AEImportPreviewResponse(
        comp_name=body.comp_name,
        comp_width=body.comp_width,
        comp_height=body.comp_height,
        layers=preview_layers,
    )


# --- Image Blocks ---

@router.post("/templates/{template_id}/image-blocks", response_model=ImageBlockResponse, status_code=status.HTTP_201_CREATED)
async def create_image_block(
    template_id: uuid.UUID,
    body: ImageBlockCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Template).where(Template.id == template_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Template not found")

    block = ImageBlock(template_id=template_id, **body.model_dump())
    db.add(block)
    await db.commit()
    await db.refresh(block)
    return block


@router.put("/templates/{template_id}/image-blocks/{block_id}", response_model=ImageBlockResponse)
async def update_image_block(
    template_id: uuid.UUID,
    block_id: uuid.UUID,
    body: ImageBlockUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(
        select(ImageBlock).where(ImageBlock.id == block_id, ImageBlock.template_id == template_id)
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Image block not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(block, key, value)
    await db.commit()
    await db.refresh(block)
    return block


@router.delete("/templates/{template_id}/image-blocks/{block_id}")
async def delete_image_block(
    template_id: uuid.UUID,
    block_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(
        select(ImageBlock).where(ImageBlock.id == block_id, ImageBlock.template_id == template_id)
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Image block not found")
    await db.delete(block)
    await db.commit()
    return {"status": "deleted"}


@router.post("/templates/{template_id}/image-blocks/{block_id}/placeholder")
async def upload_placeholder_image(
    template_id: uuid.UUID,
    block_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    result = await db.execute(
        select(ImageBlock).where(ImageBlock.id == block_id, ImageBlock.template_id == template_id)
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Image block not found")

    image_key = f"templates/{template.slug}/images/{block_id}.webp"
    data = await file.read()
    storage_service.upload(image_key, data, content_type="image/webp")

    block.placeholder_key = image_key
    await db.commit()
    return {"placeholder_key": image_key}


@router.post("/templates/{template_id}/image-blocks/{block_id}/frame")
async def upload_frame_image(
    template_id: uuid.UUID,
    block_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    result = await db.execute(
        select(ImageBlock).where(ImageBlock.id == block_id, ImageBlock.template_id == template_id)
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Image block not found")

    frame_key = f"templates/{template.slug}/frames/{block_id}.png"
    data = await file.read()
    storage_service.upload(frame_key, data, content_type="image/png")

    block.frame_image_key = frame_key
    await db.commit()
    return {"frame_image_key": frame_key}


# --- Fonts ---

@router.get("/fonts", response_model=list[FontResponse])
async def list_fonts(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Font).order_by(Font.language, Font.name))
    return result.scalars().all()


@router.post("/fonts", response_model=FontResponse, status_code=status.HTTP_201_CREATED)
async def upload_font(
    name: str,
    family_name: str,
    language: str,
    file: UploadFile,
    weight: str = "regular",
    style: str = "normal",
    preview_text: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    file_key = f"fonts/{file.filename}"
    data = await file.read()
    storage_service.upload(file_key, data, content_type="font/ttf")

    font = Font(
        name=name,
        family_name=family_name,
        language=language,
        weight=weight,
        style=style,
        file_key=file_key,
        preview_text=preview_text,
    )
    db.add(font)
    await db.commit()
    await db.refresh(font)
    return font


@router.delete("/fonts/{font_id}")
async def delete_font(
    font_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Font).where(Font.id == font_id))
    font = result.scalar_one_or_none()
    if not font:
        raise HTTPException(status_code=404, detail="Font not found")
    storage_service.delete(font.file_key)
    await db.delete(font)
    await db.commit()
    return {"status": "deleted"}


# --- Manual Render Queue (SERVER_RENDERING=false) ---

def _order_number(n: int | None, fallback_id) -> str:
    return format_order_number(n, fallback_id)


def _awaiting_render_response(
    job: RenderJob, order_no, usr: User, tmpl: Template, source: str = "local"
) -> AwaitingRenderResponse:
    return AwaitingRenderResponse(
        id=job.id,
        source=source,
        order_number=_order_number(order_no, job.id),
        status=job.status,
        progress=job.progress,
        created_at=job.created_at,
        user_name=usr.full_name or "Customer",
        user_phone=usr.phone_number,
        template_id=tmpl.id,
        template_name=tmpl.name,
        template_video_key=tmpl.video_key,
        font_id=job.font_id,
        field_values=job.field_values,
        text_color_override=job.text_color_override,
        block_overrides=job.block_overrides,
        block_format_overrides=job.block_format_overrides,
        location_url=job.location_url,
        has_pdf=bool(tmpl.pdf_snapshot_timestamps),
        error_message=job.error_message,
        # In flight on some connected worker right now — not true once the
        # job has been explicitly stopped (cancelled) or has already errored
        # out (failed), even though celery_task_id is still set from that run.
        auto_dispatched=bool(job.celery_task_id) and job.status not in ("failed", "cancelled"),
    )


async def _find_manual_job(session: AsyncSession, render_id: uuid.UUID):
    """Returns the (job, order_no, user, template) row, or None if this
    session's database has no such manual job — used to try local first,
    then fall back to production, rather than raising on a local miss."""
    result = await session.execute(
        select(RenderJob, Payment.order_number, User, Template)
        .join(Payment, Payment.render_job_id == RenderJob.id)
        .join(User, User.id == RenderJob.user_id)
        .join(Template, Template.id == RenderJob.template_id)
        .where(RenderJob.id == render_id, RenderJob.render_method == "manual")
    )
    return result.first()


async def _claim_in(session: AsyncSession, job: RenderJob, dispatch) -> None:
    """Shared claim/restart logic — `dispatch(job_id)` enqueues the render
    task on whichever broker matches `session`'s database, and returns the
    dispatched task's id."""
    if job.status not in ("pending", "processing", "failed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Render is already {job.status}")
    already_in_flight = bool(job.celery_task_id) and job.status not in ("failed", "cancelled")
    if not already_in_flight:
        job.status = "processing"
        job.error_message = None
        job.progress = 0
        task_id = dispatch(str(job.id))
        job.celery_task_id = task_id
        await session.commit()
    await session.refresh(job)


async def _cancel_in(session: AsyncSession, job: RenderJob, celery_client) -> None:
    if job.status not in ("pending", "processing"):
        raise HTTPException(status_code=400, detail=f"Render is already {job.status}, nothing to cancel")
    if job.celery_task_id:
        celery_client.control.revoke(job.celery_task_id, terminate=True, signal="SIGTERM")
    job.status = "cancelled"
    await session.commit()
    await session.refresh(job)


async def _complete_in(
    session: AsyncSession,
    job: RenderJob,
    usr: User,
    storage,
    video_data: bytes,
    pdf_data: bytes | None,
    app_base_url: str,
) -> None:
    if job.status == "completed":
        raise HTTPException(status_code=400, detail="Render already completed")
    output_key = f"renders/{job.user_id}/{job.id}/output.mp4"
    storage.upload(output_key, video_data, content_type="video/mp4")
    job.output_key = output_key
    job.status = "completed"
    job.progress = 100
    if pdf_data:
        pdf_key = f"renders/{job.user_id}/{job.id}/invitation.pdf"
        storage.upload(pdf_key, pdf_data, content_type="application/pdf")
        job.pdf_key = pdf_key
        job.pdf_status = "completed"
    await session.commit()
    # Same "your video is ready" notification the worker sends when it
    # finishes a render itself — an admin uploading the file by hand is just
    # another way the same job reaches "completed", and the customer should
    # not be able to tell the difference. `app_base_url` is passed in because
    # a production job actioned from a local admin session must still link to
    # the production site, never to localhost.
    # Best-effort: the video is already uploaded and the job already marked
    # completed above, so neither the order-number lookup nor the send may
    # raise into the admin's response. Logged with a traceback instead of
    # swallowed — a customer who never got their "video ready" message should
    # be traceable to a line in the logs.
    if usr.phone_number:
        try:
            order_no = (
                await session.execute(
                    select(Payment.order_number).where(Payment.render_job_id == job.id)
                )
            ).scalar_one_or_none()
            whatsapp_service.send_render_ready(
                usr.phone_number,
                usr.full_name or "Customer",
                _order_number(order_no, job.id),
                watch_url=f"{app_base_url.rstrip('/')}/watch/{job.id}",
            )
        except Exception:
            logger.exception(
                "[WhatsApp] Render-ready notification failed for job %s", job.id
            )


@router.get("/renders/awaiting", response_model=AwaitingRendersListResponse)
async def list_awaiting_renders(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    """Manual (SERVER_RENDERING=false) renders that still need attention —
    queued/rendering, or stopped/errored and awaiting an admin decision to
    restart them — oldest request first. Not paginated — this queue is meant
    to stay small/empty in normal operation."""
    result = await db.execute(
        select(RenderJob, Payment.order_number, User, Template)
        .join(Payment, Payment.render_job_id == RenderJob.id)
        .join(User, User.id == RenderJob.user_id)
        .join(Template, Template.id == RenderJob.template_id)
        .where(RenderJob.render_method == "manual", RenderJob.status.in_(["pending", "processing", "failed", "cancelled"]))
        .order_by(RenderJob.created_at.asc())
    )
    rows = result.all()

    renders = [_awaiting_render_response(job, order_no, usr, tmpl) for job, order_no, usr, tmpl in rows]

    # Also fold in production's manual-render queue when PROD_DATABASE_URL is
    # configured — read-only (see database.py), and these rows aren't
    # actionable from here: claim/cancel look the job up in the LOCAL db by
    # id, so a production-sourced id just won't be found there. The frontend
    # marks these `source: "production"` and disables the action buttons.
    if prod_async_session is not None:
        try:
            async with prod_async_session() as prod_db:
                prod_result = await prod_db.execute(
                    select(RenderJob, Payment.order_number, User, Template)
                    .join(Payment, Payment.render_job_id == RenderJob.id)
                    .join(User, User.id == RenderJob.user_id)
                    .join(Template, Template.id == RenderJob.template_id)
                    .where(
                        RenderJob.render_method == "manual",
                        RenderJob.status.in_(["pending", "processing", "failed", "cancelled"]),
                    )
                    .order_by(RenderJob.created_at.asc())
                )
                renders += [
                    _awaiting_render_response(job, order_no, usr, tmpl, source="production")
                    for job, order_no, usr, tmpl in prod_result.all()
                ]
        except Exception as e:
            # Tailscale down, prod DB unreachable, etc. — local queue still
            # renders fine, just without the production rows this time.
            print(f"[admin] could not reach production DB for awaiting-renders: {e}")

    renders.sort(key=lambda r: r.created_at)

    # Typical turnaround = median (created_at -> updated_at) over past
    # completed manual jobs, shown to reassure the waiting user it's usually
    # faster than the stated max.
    completed_result = await db.execute(
        select(RenderJob.created_at, RenderJob.updated_at)
        .where(RenderJob.render_method == "manual", RenderJob.status == "completed")
        .order_by(RenderJob.updated_at.desc())
        .limit(50)
    )
    durations = sorted(
        (updated - created).total_seconds() / 3600 for created, updated in completed_result.all()
    )
    typical_hours = None
    if durations:
        mid = len(durations) // 2
        typical_hours = durations[mid] if len(durations) % 2 else (durations[mid - 1] + durations[mid]) / 2
        typical_hours = round(typical_hours, 1)

    return AwaitingRendersListResponse(renders=renders, typical_turnaround_hours=typical_hours, auto_render_enabled=settings.DEBUG)


@router.post("/renders/{render_id}/claim", response_model=AwaitingRenderResponse)
async def claim_render(
    render_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    """Manual render jobs now auto-dispatch to Celery the moment the order is
    paid (see payments.py verify_payment) — the task sits durably queued in
    Redis until any connected local worker picks it up, no click required.
    So in the normal case this endpoint is a no-op: the job already has a
    celery_task_id from checkout, and clicking here would just enqueue a
    second concurrent render of the same job. It only actually (re)dispatches
    when there's no task in flight — i.e. a manual retry after a failed or
    cancelled render, or a legacy job from before auto-dispatch existed. This
    doubles as the "Restart" action for a failed/cancelled job.

    Tries the local database first; if the id isn't found there, falls back
    to production (see PROD_DATABASE_URL/PROD_REDIS_URL) — dispatch goes to
    whichever broker actually has a worker that can see this job's row."""
    row = await _find_manual_job(db, render_id)
    if row:
        job, order_no, usr, tmpl = row
        await _claim_in(db, job, lambda jid: render_video_task.delay(jid).id)
        return _awaiting_render_response(job, order_no, usr, tmpl)

    if prod_async_session is None or prod_celery_app is None:
        raise HTTPException(status_code=404, detail="Manual render job not found")
    async with prod_async_session() as prod_db:
        row = await _find_manual_job(prod_db, render_id)
        if not row:
            raise HTTPException(status_code=404, detail="Manual render job not found")
        job, order_no, usr, tmpl = row
        await _claim_in(prod_db, job, lambda jid: prod_celery_app.send_task("render_video", args=[jid]).id)
        return _awaiting_render_response(job, order_no, usr, tmpl, source="production")


@router.post("/renders/{render_id}/cancel", response_model=AwaitingRenderResponse)
async def cancel_render(
    render_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    """Stop a manual render that's queued or actively rendering. Revokes the
    Celery task — if it's already running on a worker, terminate=True sends
    SIGTERM to the process actually executing it (default prefork pool), so
    it stops instead of running to completion in the background. This is
    deliberately not the same path as a crashed worker: an explicit revoke
    is not requeued, unlike task_reject_on_worker_lost in celery_app.py.
    Restart it later via /claim, which treats "cancelled" the same as
    "failed" — no task in flight, safe to dispatch fresh.

    Same local-then-production fallback as /claim — the revoke goes out on
    whichever broker actually has a worker running this task."""
    row = await _find_manual_job(db, render_id)
    if row:
        job, order_no, usr, tmpl = row
        await _cancel_in(db, job, celery_app)
        return _awaiting_render_response(job, order_no, usr, tmpl)

    if prod_async_session is None or prod_celery_app is None:
        raise HTTPException(status_code=404, detail="Manual render job not found")
    async with prod_async_session() as prod_db:
        row = await _find_manual_job(prod_db, render_id)
        if not row:
            raise HTTPException(status_code=404, detail="Manual render job not found")
        job, order_no, usr, tmpl = row
        await _cancel_in(prod_db, job, prod_celery_app)
        return _awaiting_render_response(job, order_no, usr, tmpl, source="production")


@router.post("/renders/{render_id}/complete")
async def complete_manual_render(
    render_id: uuid.UUID,
    video: UploadFile,
    pdf: UploadFile | None = None,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    """Admin uploads the video (required) they rendered locally, and the PDF
    (optional — only meaningful if the template has PDF snapshots configured)
    — marks the job completed and notifies the customer on WhatsApp.

    Same local-then-production fallback as claim/cancel — a production job's
    file goes to production's own R2 bucket (prod_storage_service), never
    local MinIO."""
    video_data = await video.read()
    if not video_data:
        raise HTTPException(status_code=400, detail="Video file is empty")
    pdf_data = await pdf.read() if pdf is not None else None

    result = await db.execute(
        select(RenderJob, User).join(User, User.id == RenderJob.user_id).where(
            RenderJob.id == render_id, RenderJob.render_method == "manual"
        )
    )
    row = result.first()
    if row:
        job, usr = row
        await _complete_in(db, job, usr, storage_service, video_data, pdf_data, settings.APP_BASE_URL)
        return {"status": "completed"}

    if prod_async_session is None or prod_storage_service is None:
        raise HTTPException(status_code=404, detail="Manual render job not found")
    async with prod_async_session() as prod_db:
        result = await prod_db.execute(
            select(RenderJob, User).join(User, User.id == RenderJob.user_id).where(
                RenderJob.id == render_id, RenderJob.render_method == "manual"
            )
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="Manual render job not found")
        job, usr = row
        await _complete_in(
            prod_db, job, usr, prod_storage_service, video_data, pdf_data,
            settings.PROD_APP_BASE_URL or settings.APP_BASE_URL,
        )
        return {"status": "completed"}
