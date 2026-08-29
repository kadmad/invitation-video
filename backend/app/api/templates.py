import hashlib
import hmac
import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from io import BytesIO

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import RedirectResponse, Response, StreamingResponse
from PIL import Image
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


_LAN_ORIGIN_RE = re.compile(
    r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$"
)


def _same_site(request: Request) -> bool:
    """Defense-in-depth for the raw source video endpoints only. Rejects a
    request whose Origin/Referer explicitly names a different site — blocks
    another website embedding these endpoints directly in its own page, and
    copy-pasted scraping scripts that carry a browser's Referer verbatim.

    This is NOT real access control: Origin/Referer are client-supplied and
    trivially spoofable by anything that isn't an actual browser, so a script
    that sets the header itself sails straight through. There's no way to
    fully close that for a public, unauthenticated, pre-signup preview
    endpoint without requiring login — which would break anonymous template
    browsing/customization. The real gate is the short-lived signed token;
    this just narrows casual/automated abuse on top of it.

    Native <video>/media requests and most non-browser HTTP clients often
    send neither header at all, so both being absent is allowed through
    rather than blocked — this only rejects an explicit, named mismatch."""
    allowed = {o.strip().rstrip("/") for o in settings.BACKEND_CORS_ORIGINS.split(",") if o.strip()}
    header = request.headers.get("origin") or request.headers.get("referer")
    if not header:
        return True
    origin = "/".join(header.split("/", 3)[:3]).rstrip("/")
    return origin in allowed or bool(_LAN_ORIGIN_RE.match(origin))


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
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Issue a short-lived signed token for video playback."""
    if not _same_site(request):
        raise HTTPException(status_code=403, detail="Forbidden")
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template or not template.video_key:
        raise HTTPException(status_code=404, detail="Template not found")
    token, expires_at = _generate_video_token(str(template_id))
    host = request.url.hostname
    # Extract version from preview_key for cache busting (preview_<ts>.mp4)
    preview_version = ""
    preview_url = None
    if template.preview_key:
        m = re.search(r"preview_(\d+)\.mp4$", template.preview_key)
        preview_version = m.group(1) if m else ""
        # The admin-reviewed preview (sample text baked in) is the deliberately
        # shareable/promotional asset — fine as a direct, cacheable CDN link.
        preview_url = storage_service.presigned_url(template.preview_key, expires=3600, public_host=host)
    return {
        "token": token,
        "expires_at": expires_at,
        "has_preview": bool(template.preview_key),
        "preview_status": template.preview_status,
        "preview_v": preview_version,
        # The raw, unwatermarked source is never handed out as a direct
        # storage link (permanent + guessable once someone has the key) —
        # only ever streamed through the token-gated proxy below, which
        # expires with the token and never reveals the underlying URL.
        "video_stream_url": f"/api/templates/{template_id}/video-file?token={token}",
        "preview_stream_url": (
            f"/api/templates/{template_id}/preview-file?token={token}" if template.preview_key else None
        ),
        "video_url": None,
        "preview_url": preview_url,
    }


@router.get("/{template_id}/preview-video")
async def get_preview_video(
    template_id: uuid.UUID,
    request: Request,
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
    url = storage_service.presigned_url(template.preview_key, expires=3600, public_host=request.url.hostname)
    return RedirectResponse(url=url, status_code=302)


@router.get("/{template_id}/video")
async def get_video(
    template_id: uuid.UUID,
    request: Request,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Same raw source video as /video-file — kept as a separate route for
    backward compatibility, both now stream through the backend rather than
    redirecting. Used to redirect to a presigned S3 URL, but that URL is
    permanent once CDN_BASE_URL is set (see storage_service.presigned_url),
    and the token is interchangeable between these routes — a redirect here
    would've let anyone swap a `video-file` token for a forever-valid direct
    link, defeating the point of gating it at all."""
    if not _same_site(request):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not _verify_video_token(token, str(template_id)):
        raise HTTPException(status_code=403, detail="Invalid or expired token")
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.video_key:
        raise HTTPException(status_code=400, detail="No video uploaded")
    return await _stream_from_storage(request, template.video_key)


@router.get("/{template_id}/music-file")
async def get_template_music_file(
    template_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """The template's soundtrack, streamed same-origin.

    Ungated on purpose, unlike the source video: the track is already audible
    to anyone who opens the editor, and it's what the customer is deciding
    whether to keep. Same-origin also means the editor can fetch these bytes
    for waveform analysis — decodeAudioData goes through fetch(), which a
    presigned MinIO/R2 URL would fail on CORS."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.music_key:
        raise HTTPException(status_code=404, detail="No music on this template")
    return await _stream_from_storage(request, template.music_key)


async def _stream_from_storage(request: Request, key: str) -> StreamingResponse:
    """Proxy bytes from MinIO/R2 through the backend, forwarding Range requests
    so video seeking still works. The raw template source (video_key) always
    goes through this proxy now, whatever the deployment topology — it's the
    only way to serve it without handing out a permanent, unauthenticated
    direct storage link (see get_video_token). Preview/render/thumbnail
    assets are lower-stakes and still get the cheaper direct CDN link."""
    internal_url = storage_service.internal_presigned_url(key, expires=600)
    headers = {}
    range_header = request.headers.get("range")
    if range_header:
        headers["range"] = range_header

    client = httpx.AsyncClient(timeout=30)
    upstream = await client.send(
        client.build_request("GET", internal_url, headers=headers), stream=True
    )

    async def body():
        try:
            async for chunk in upstream.aiter_bytes(65536):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    passthrough_headers = {}
    for h in ("content-range", "content-length", "accept-ranges", "cache-control"):
        if h in upstream.headers:
            passthrough_headers[h] = upstream.headers[h]
    passthrough_headers.setdefault("accept-ranges", "bytes")

    return StreamingResponse(
        body(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "video/mp4"),
        headers=passthrough_headers,
    )


@router.get("/{template_id}/video-file")
async def stream_video_file(
    template_id: uuid.UUID,
    request: Request,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Same video as /video, streamed through the backend instead of redirecting
    to MinIO directly — for setups where only the backend is externally reachable."""
    if not _same_site(request):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not _verify_video_token(token, str(template_id)):
        raise HTTPException(status_code=403, detail="Invalid or expired token")
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template or not template.video_key:
        raise HTTPException(status_code=404, detail="No video uploaded")
    return await _stream_from_storage(request, template.video_key)


@router.get("/{template_id}/preview-file")
async def stream_preview_file(
    template_id: uuid.UUID,
    request: Request,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Same preview video as /preview-video, streamed through the backend."""
    if not _verify_video_token(token, str(template_id)):
        raise HTTPException(status_code=403, detail="Invalid or expired token")
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template or not template.preview_key:
        raise HTTPException(status_code=404, detail="No preview available")
    return await _stream_from_storage(request, template.preview_key)


_THUMBNAIL_SM_WIDTH = 520  # ~2x the widest small-display use (carousel cards, 260px)


def _resize_thumbnail_sm(data: bytes) -> bytes:
    """Downscale a template thumbnail to _THUMBNAIL_SM_WIDTH for the small,
    decorative contexts (landing hero, carousels) that never display it any
    larger — the stored master is sized for the /templates browse grid and
    og:image/social-share use, where mobile single-column cards and link
    previews genuinely want the full resolution. Falls back to the original
    bytes on any decode failure rather than 500ing a thumbnail request."""
    try:
        img = Image.open(BytesIO(data))
        if img.width <= _THUMBNAIL_SM_WIDTH:
            return data
        height = round(img.height * _THUMBNAIL_SM_WIDTH / img.width)
        img = img.convert("RGB").resize((_THUMBNAIL_SM_WIDTH, height), Image.LANCZOS)
        out = BytesIO()
        img.save(out, format="WEBP", quality=78, method=6)
        return out.getvalue()
    except Exception:
        return data


@router.get("/{slug}/thumbnail")
async def get_thumbnail(
    slug: str,
    size: str | None = Query(None, description="'sm' for a small resized variant"),
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
    if size == "sm":
        data = _resize_thumbnail_sm(data)
    return Response(
        content=data,
        media_type="image/webp",
        headers={
            # 7d, not 1d: PageSpeed flagged these as the dominant contributor
            # to "use efficient cache lifetimes" savings — thumbnails rarely
            # change once a template is published, so repeat visitors were
            # re-downloading them daily for no reason.
            "Cache-Control": "public, max-age=604800",
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
    request: Request,
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

    url = storage_service.presigned_url(image_key, public_host=request.url.hostname)
    return {"image_key": image_key, "url": url}


@router.post("/{template_id}/upload-music")
async def upload_user_music(
    template_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Customer's own audio track, to replace the template's original audio
    in their final render. A track shorter than the video is allowed — it just
    runs out and the tail of the video is silent."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    data = await file.read()
    ext = os.path.splitext(file.filename or "")[1] or ".mp3"

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
        # A track shorter than the video used to be rejected here, which left
        # the customer holding a song they had chosen and no way forward. It
        # is accepted now and simply runs out: Remotion's <Audio> ends, and
        # ffmpeg's atrim yields less audio than asked for rather than
        # erroring. The editor warns about the silent tail before checkout.

    music_key = f"user_music/{user.id}/{template_id}/{uuid.uuid4()}{ext}"
    storage_service.upload(music_key, data, content_type=file.content_type or "audio/mpeg")

    return {"music_key": music_key, "duration_seconds": duration}
