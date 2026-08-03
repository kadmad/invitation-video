import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_admin_user, get_db
from app.schemas.font import FontResponse
from app.services.storage_service import storage_service
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
    content_type = "font/woff2" if font.file_key.endswith(".woff2") else "font/ttf"
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/", response_model=FontResponse, status_code=status.HTTP_201_CREATED)
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
