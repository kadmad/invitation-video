import uuid
from datetime import datetime

from pydantic import BaseModel


class TextBlockResponse(BaseModel):
    id: uuid.UUID
    sort_order: int
    content: str
    position_x: float
    position_y: float
    max_width: float
    font_id: uuid.UUID | None
    font_size_ratio: float
    text_color: str
    text_align: str
    letter_spacing: float | None = None
    font_weight: str | None = None
    animation_type: str
    animation_out: str
    anim_in_direction: str
    anim_out_direction: str
    anim_in_duration: float
    anim_out_duration: float
    start_time: float
    end_time: float
    tag_config: dict | None
    format_ranges: list[dict] | None = None
    transliteration_overrides: dict | None = None

    model_config = {"from_attributes": True}


class ImageBlockResponse(BaseModel):
    id: uuid.UUID
    sort_order: int
    label: str
    position_x: float
    position_y: float
    width: float
    height: float
    mask_shape: str
    mask_feather: float
    frame_image_key: str | None
    ken_burns_enabled: bool
    ken_burns_zoom: float
    ken_burns_direction: str
    opacity: float
    animation_type: str
    start_time: float
    end_time: float
    placeholder_key: str | None
    is_user_uploadable: bool

    model_config = {"from_attributes": True}


class TemplateListResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    category_id: uuid.UUID
    thumbnail_key: str | None
    video_key: str | None
    duration_frames: int
    fps: int
    width: int
    height: int
    is_published: bool
    default_text_color: str
    default_font_id: uuid.UUID | None
    render_notes: str | None
    preview_key: str | None = None
    preview_status: str | None = None
    price: int
    discount_amount_paise: int | None = None
    seo_description: str | None = None
    # Where the brand watermark sits on a discounted render. Needed by the
    # customer-side opt-in preview so it shows the admin's actual placement
    # instead of falling back to the component's hardcoded defaults.
    watermark_position_x: float | None = None
    watermark_position_y: float | None = None
    watermark_width: float | None = None
    watermark_rotation: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TemplateDetailResponse(TemplateListResponse):
    video_key: str | None
    remotion_comp: str | None
    tag_labels: dict | None
    pdf_snapshot_timestamps: list[float] | None = None
    text_blocks: list[TextBlockResponse]
    image_blocks: list[ImageBlockResponse]

    model_config = {"from_attributes": True}
