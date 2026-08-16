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
    block_overrides: dict | None = None
    block_format_overrides: dict | None = None
    progress: int
    output_key: str | None
    pdf_key: str | None
    pdf_status: str | None
    location_url: str | None
    error_message: str | None
    render_notes: str | None = None
    render_method: str = "server"
    # Only meaningful when render_method == "manual": can the user still edit
    # their submitted details (True only while status is still "pending",
    # i.e. no admin has claimed it yet), and how long it's typically taking.
    can_edit: bool = False
    typical_turnaround_hours: float | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RenderUpdate(BaseModel):
    """User-editable fields for a manual render still in "pending" status —
    same shape as what's captured at order time, just PATCHable afterward."""
    font_id: uuid.UUID | None = None
    field_values: dict[str, str] | None = None
    text_color_override: dict[str, str] | None = None
    block_overrides: dict[str, str] | None = None
    block_format_overrides: dict | None = None
    location_url: str | None = None
