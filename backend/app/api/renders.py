import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db
from app.models.render_job import RenderJob
from app.models.template import Template
from app.models.user import User
from app.schemas.render import RenderCreate, RenderResponse
from app.services.storage_service import storage_service
from app.workers.tasks import render_video_task

router = APIRouter()


@router.post("/", response_model=RenderResponse, status_code=status.HTTP_201_CREATED)
async def submit_render(
    body: RenderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate template has a source video
    result = await db.execute(select(Template).where(Template.id == body.template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.video_key:
        raise HTTPException(status_code=400, detail="Template has no source video uploaded yet")

    job = RenderJob(
        user_id=user.id,
        template_id=body.template_id,
        font_id=body.font_id,
        field_values=body.field_values,
        text_color_override=body.text_color_override,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    task = render_video_task.delay(str(job.id))
    job.celery_task_id = task.id
    await db.commit()
    await db.refresh(job)

    return job


@router.get("/", response_model=list[RenderResponse])
async def list_renders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RenderJob)
        .where(RenderJob.user_id == user.id)
        .order_by(RenderJob.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{render_id}", response_model=RenderResponse)
async def get_render(
    render_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RenderJob)
        .where(RenderJob.id == render_id, RenderJob.user_id == user.id)
        .options(selectinload(RenderJob.template))
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    # Attach template render_notes to response
    response = RenderResponse.model_validate(job)
    if job.template:
        response.render_notes = job.template.render_notes
    return response


@router.get("/{render_id}/download")
async def download_render(
    render_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RenderJob).where(RenderJob.id == render_id, RenderJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    if job.status != "completed" or not job.output_key:
        raise HTTPException(status_code=400, detail="Render not ready for download")

    data = storage_service.download(job.output_key)
    return Response(
        content=data,
        media_type="video/mp4",
        headers={
            "Content-Disposition": f'attachment; filename="render_{render_id}.mp4"',
            "Cache-Control": "private, max-age=3600",
        },
    )
