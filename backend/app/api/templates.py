import hashlib
import hmac
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import get_admin_user, get_current_user, get_db
from app.models.template import Template
from app.models.image_block import ImageBlock
from app.models.user import User
from app.schemas.template import (
    TemplateDetailResponse,
    TemplateListResponse,
)
from app.services.storage_service import storage_service

router = APIRouter()

_TOKEN_TTL = 300  # 5 minutes


def _generate_video_token(template_id: str) -> tuple[str, int]:
    expires = int(time.time()) + _TOKEN_TTL
    msg = f"{template_id}:{expires}".encode()
    sig = hmac.new(settings.JWT_SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()
    return f"{expires}.{sig}", expires


def _verify_video_token(token: str, template_id: str) -> bool:
    try:
        expires_str, sig = token.split(".", 1)
        expires = int(expires_str)
        if time.time() > expires:
            return False
        msg = f"{template_id}:{expires}".encode()
        expected = hmac.new(settings.JWT_SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, sig)
    except Exception:
        return False


@router.get("/", response_model=list[TemplateListResponse])
async def list_templates(
    category_id: uuid.UUID | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Template).where(Template.is_published == True)
    if category_id:
        query = query.where(Template.category_id == category_id)
    if search:
        query = query.where(Template.name.ilike(f"%{search}%"))
    query = query.order_by(Template.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{slug_or_id}", response_model=TemplateDetailResponse)
async def get_template(slug_or_id: str, db: AsyncSession = Depends(get_db)):
    # Try UUID first, then slug
    try:
        template_id = uuid.UUID(slug_or_id)
        result = await db.execute(
            select(Template)
            .options(selectinload(Template.text_blocks), selectinload(Template.image_blocks))
            .where(Template.id == template_id)
        )
    except ValueError:
        result = await db.execute(
            select(Template)
            .options(selectinload(Template.text_blocks), selectinload(Template.image_blocks))
            .where(Template.slug == slug_or_id)
        )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.get("/{template_id}/video-token")
async def get_video_token(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Issue a short-lived signed token for video playback."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template or not template.video_key:
        raise HTTPException(status_code=404, detail="Template not found")
    token, expires_at = _generate_video_token(str(template_id))
    # Presigned S3 URL for direct browser access (native range requests, no proxy)
    video_url = storage_service.presigned_url(template.video_key, expires=300)
    # Extract version from preview_key for cache busting (preview_<ts>.mp4)
    preview_version = ""
    preview_url = None
    if template.preview_key:
        import re as _re
        m = _re.search(r"preview_(\d+)\.mp4$", template.preview_key)
        preview_version = m.group(1) if m else ""
        preview_url = storage_service.presigned_url(template.preview_key, expires=3600)
    return {
        "token": token,
        "expires_at": expires_at,
        "has_preview": bool(template.preview_key),
        "preview_status": template.preview_status,
        "preview_v": preview_version,
        "video_url": video_url,
        "preview_url": preview_url,
    }


@router.get("/{template_id}/preview-video")
async def get_preview_video(
    template_id: uuid.UUID,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Redirect to presigned S3 URL for pre-rendered preview video."""
    if not _verify_video_token(token, str(template_id)):
        raise HTTPException(status_code=403, detail="Invalid or expired token")
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template or not template.preview_key:
        raise HTTPException(status_code=404, detail="No preview available")
    url = storage_service.presigned_url(template.preview_key, expires=3600)
    return RedirectResponse(url=url, status_code=302)


@router.get("/{template_id}/video")
async def get_video(
    template_id: uuid.UUID,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Redirect to presigned S3 URL — native range request support, no proxy overhead."""
    if not _verify_video_token(token, str(template_id)):
        raise HTTPException(status_code=403, detail="Invalid or expired token")
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.video_key:
        raise HTTPException(status_code=400, detail="No video uploaded")
    url = storage_service.presigned_url(template.video_key, expires=300)
    return RedirectResponse(url=url, status_code=302)


@router.get("/{slug}/thumbnail")
async def get_thumbnail(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Proxy template WebP thumbnail from MinIO."""
    result = await db.execute(select(Template).where(Template.slug == slug))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.thumbnail_key:
        raise HTTPException(status_code=404, detail="No thumbnail available")
    data = storage_service.download(template.thumbnail_key)
    return Response(
        content=data,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/{template_id}/upload-video")
async def upload_video(
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
    await db.commit()
    return {"video_key": video_key}


@router.post("/{template_id}/image-blocks/{block_id}/upload")
async def upload_user_image(
    template_id: uuid.UUID,
    block_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ImageBlock).where(
            ImageBlock.id == block_id,
            ImageBlock.template_id == template_id,
            ImageBlock.is_user_uploadable == True,
        )
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Image block not found")

    image_key = f"user_images/{user.id}/{template_id}/{block_id}.webp"
    data = await file.read()
    storage_service.upload(image_key, data, content_type="image/webp")

    url = storage_service.presigned_url(image_key)
    return {"image_key": image_key, "url": url}
