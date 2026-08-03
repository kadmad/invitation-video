import uuid

from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    sort_order: int = 0


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}
