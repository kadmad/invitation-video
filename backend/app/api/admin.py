import json
import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_admin_user, get_db
from app.models.category import Category
from app.models.font import Font
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
    ImageBlockCreate,
    ImageBlockUpdate,
    ImageBlockResponse,
    AnalyticsSummary,
    TemplateAnalyticsRow,
    PeriodData,
)
from app.schemas.font import FontResponse
from app.services.storage_service import storage_service

router = APIRouter()


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
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(template, key, value)
    await db.commit()
    await db.refresh(template)
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
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_admin_user),
):
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.video_key:
        raise HTTPException(status_code=400, detail="No video uploaded")

    url = storage_service.presigned_url(template.video_key)
    return {"url": url}


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
