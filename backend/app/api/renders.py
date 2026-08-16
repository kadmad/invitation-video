import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db
from app.models.render_job import RenderJob
from app.models.template import Template
from app.models.user import User
from app.schemas.render import RenderCreate, RenderResponse, RenderUpdate
from app.services.storage_service import storage_service
from app.workers.tasks import render_video_task

router = APIRouter()


async def _typical_manual_turnaround_hours(db: AsyncSession) -> float | None:
    result = await db.execute(
        select(RenderJob.created_at, RenderJob.updated_at)
        .where(RenderJob.render_method == "manual", RenderJob.status == "completed")
        .order_by(RenderJob.updated_at.desc())
        .limit(50)
    )
    durations = sorted((updated - created).total_seconds() / 3600 for created, updated in result.all())
    if not durations:
        return None
    mid = len(durations) // 2
    value = durations[mid] if len(durations) % 2 else (durations[mid - 1] + durations[mid]) / 2
    return round(value, 1)


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
    if job.render_method == "manual":
        response.can_edit = job.status == "pending"
        response.typical_turnaround_hours = await _typical_manual_turnaround_hours(db)
    return response


@router.patch("/{render_id}", response_model=RenderResponse)
async def update_render(
    render_id: uuid.UUID,
    body: RenderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Let the customer amend their own details on a manual-render order —
    only while it's still sitting "pending" (no admin has claimed it yet).
    Once an admin clicks "Run Render" the job moves to "processing" and this
    is locked, so nobody edits values out from under an in-progress render."""
    result = await db.execute(
        select(RenderJob)
        .where(RenderJob.id == render_id, RenderJob.user_id == user.id)
        .options(selectinload(RenderJob.template))
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    if job.render_method != "manual":
        raise HTTPException(status_code=400, detail="This order can't be edited")
    if job.status != "pending":
        raise HTTPException(status_code=400, detail="This order is already being rendered and can no longer be edited")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(job, key, value)
    await db.commit()
    await db.refresh(job)

    response = RenderResponse.model_validate(job)
    if job.template:
        response.render_notes = job.template.render_notes
    response.can_edit = job.status == "pending"
    response.typical_turnaround_hours = await _typical_manual_turnaround_hours(db)
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

    return RedirectResponse(storage_service.public_url(job.output_key), status_code=307)


@router.get("/{render_id}/download-pdf")
async def download_pdf(
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
    if job.status != "completed" or not job.pdf_key:
        raise HTTPException(status_code=400, detail="PDF not ready for download")

    return RedirectResponse(storage_service.public_url(job.pdf_key), status_code=307)
