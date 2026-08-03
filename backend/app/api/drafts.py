import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.models.user_draft import UserDraft

router = APIRouter()


class DraftBody(BaseModel):
    field_values: dict[str, str]
    font_id: uuid.UUID | None = None
    text_color_override: dict[str, str] | None = None


class DraftResponse(BaseModel):
    template_id: uuid.UUID
    field_values: dict
    font_id: uuid.UUID | None
    text_color_override: dict | None

    model_config = {"from_attributes": True}


class DraftListItem(BaseModel):
    template_id: uuid.UUID
    template_name: str
    template_slug: str
    field_values: dict
    font_id: uuid.UUID | None
    text_color_override: dict | None
    updated_at: str

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[DraftListItem])
async def list_drafts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.template import Template

    result = await db.execute(
        select(UserDraft, Template.name, Template.slug)
        .join(Template, UserDraft.template_id == Template.id)
        .where(UserDraft.user_id == user.id)
        .order_by(UserDraft.updated_at.desc())
    )
    items = []
    for row in result.all():
        draft = row[0]
        items.append(DraftListItem(
            template_id=draft.template_id,
            template_name=row[1],
            template_slug=row[2],
            field_values=draft.field_values,
            font_id=draft.font_id,
            text_color_override=draft.text_color_override,
            updated_at=draft.updated_at.isoformat() if draft.updated_at else "",
        ))
    return items


@router.get("/{template_id}", response_model=DraftResponse | None)
async def get_draft(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserDraft).where(
            UserDraft.user_id == user.id,
            UserDraft.template_id == template_id,
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        return None
    return draft


@router.put("/{template_id}", response_model=DraftResponse)
async def save_draft(
    template_id: uuid.UUID,
    body: DraftBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserDraft).where(
            UserDraft.user_id == user.id,
            UserDraft.template_id == template_id,
        )
    )
    draft = result.scalar_one_or_none()

    if draft:
        draft.field_values = body.field_values
        draft.font_id = body.font_id
        draft.text_color_override = body.text_color_override
    else:
        draft = UserDraft(
            user_id=user.id,
            template_id=template_id,
            field_values=body.field_values,
            font_id=body.font_id,
            text_color_override=body.text_color_override,
        )
        db.add(draft)

    await db.commit()
    await db.refresh(draft)
    return draft


@router.delete("/{template_id}")
async def delete_draft(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserDraft).where(
            UserDraft.user_id == user.id,
            UserDraft.template_id == template_id,
        )
    )
    draft = result.scalar_one_or_none()
    if draft:
        await db.delete(draft)
        await db.commit()
    return {"ok": True}
