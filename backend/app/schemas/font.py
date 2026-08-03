import uuid

from pydantic import BaseModel


class FontResponse(BaseModel):
    id: uuid.UUID
    name: str
    family_name: str
    language: str
    weight: str
    style: str
    preview_text: str | None

    model_config = {"from_attributes": True}
