import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.font import FontResponse
from app.services.storage_service import storage_service
from app.services.font_metadata import content_type_for_font
from app.models.font import Font

router = APIRouter()


@router.get("/", response_model=list[FontResponse])
async def list_fonts(
    language: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Font)
    if language:
        query = query.where(Font.language == language)
    result = await db.execute(query.order_by(Font.language, Font.name))
    return result.scalars().all()


@router.get("/{font_id}/file")
async def get_font_file(
    font_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Proxy font file from MinIO to avoid CORS issues."""
    result = await db.execute(select(Font).where(Font.id == font_id))
    font = result.scalar_one_or_none()
    if not font:
        raise HTTPException(status_code=404, detail="Font not found")

    data = storage_service.download(font.file_key)
    content_type = content_type_for_font(font.file_key)
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )
