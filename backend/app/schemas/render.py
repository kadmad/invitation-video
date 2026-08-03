import uuid
from datetime import datetime

from pydantic import BaseModel


class RenderCreate(BaseModel):
    template_id: uuid.UUID
    font_id: uuid.UUID | None = None
    field_values: dict[str, str]
    text_color_override: dict[str, str] | None = None  # {"_default": "#hex", "<block_id>": "#hex"}


class RenderResponse(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    font_id: uuid.UUID | None
    status: str
    field_values: dict
    text_color_override: dict | None
    progress: int
    output_key: str | None
    error_message: str | None
    render_notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
