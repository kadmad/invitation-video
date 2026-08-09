import uuid
from datetime import datetime

from pydantic import BaseModel


# --- Categories ---

class AdminCategoryCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    sort_order: int = 0


class AdminCategoryUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class AdminCategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


# --- Templates ---

class AdminTemplateCreate(BaseModel):
    name: str
    slug: str
    category_id: uuid.UUID
    duration_frames: int = 300
    fps: int = 30
    width: int = 1080
    height: int = 1920


class AdminTemplateUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    category_id: uuid.UUID | None = None
    duration_frames: int | None = None
    fps: int | None = None
    width: int | None = None
    height: int | None = None
    is_published: bool | None = None
    tag_labels: dict | None = None
    default_text_color: str | None = None
    default_font_id: uuid.UUID | None = None
    render_notes: str | None = None
    price: int | None = None
    render_preview: bool = False  # explicit flag — only queue preview render when True


# --- Text Blocks ---

class TextBlockCreate(BaseModel):
    content: str = "{text}"
    sort_order: int = 0
    position_x: float = 0.5
    position_y: float = 0.5
    max_width: float = 0.8
    font_id: uuid.UUID | None = None
    font_size_ratio: float = 0.05
    text_color: str = "#FFFFFF"
    text_align: str = "center"
    animation_type: str = "fade_in"
    animation_out: str = "none"
    anim_in_direction: str = "ltr"
    anim_out_direction: str = "ltr"
    anim_in_duration: float = 1.0
    anim_out_duration: float = 1.0
    start_time: float = 0.0
    end_time: float = 2.0
    tag_config: dict | None = None
    format_ranges: list[dict] | None = None


class TextBlockUpdate(BaseModel):
    content: str | None = None
    sort_order: int | None = None
    position_x: float | None = None
    position_y: float | None = None
    max_width: float | None = None
    font_id: uuid.UUID | None = None
    font_size_ratio: float | None = None
    text_color: str | None = None
    text_align: str | None = None
    animation_type: str | None = None
    animation_out: str | None = None
    anim_in_direction: str | None = None
    anim_out_direction: str | None = None
    anim_in_duration: float | None = None
    anim_out_duration: float | None = None
    start_time: float | None = None
    end_time: float | None = None
    tag_config: dict | None = None
    format_ranges: list[dict] | None = None


class TextBlockResponse(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    sort_order: int
    content: str
    position_x: float
    position_y: float
    max_width: float
    font_id: uuid.UUID | None
    font_size_ratio: float
    text_color: str
    text_align: str
    animation_type: str
    animation_out: str
    anim_in_direction: str
    anim_out_direction: str
    anim_in_duration: float
    anim_out_duration: float
    start_time: float
    end_time: float
    tag_config: dict | None
    format_ranges: list[dict] | None

    model_config = {"from_attributes": True}


# --- Image Blocks ---

class ImageBlockCreate(BaseModel):
    sort_order: int = 0
    label: str = "Photo"
    position_x: float = 0.5
    position_y: float = 0.5
    width: float = 0.3
    height: float = 0.3
    mask_shape: str = "none"
    mask_feather: float = 0.0
    ken_burns_enabled: bool = False
    ken_burns_zoom: float = 1.2
    ken_burns_direction: str = "zoom_in"
    opacity: float = 1.0
    animation_type: str = "none"
    start_time: float = 0.0
    end_time: float = 3.0
    is_user_uploadable: bool = True


class ImageBlockUpdate(BaseModel):
    sort_order: int | None = None
    label: str | None = None
    position_x: float | None = None
    position_y: float | None = None
    width: float | None = None
    height: float | None = None
    mask_shape: str | None = None
    mask_feather: float | None = None
    ken_burns_enabled: bool | None = None
    ken_burns_zoom: float | None = None
    ken_burns_direction: str | None = None
    opacity: float | None = None
    animation_type: str | None = None
    start_time: float | None = None
    end_time: float | None = None
    is_user_uploadable: bool | None = None


class ImageBlockResponse(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
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


# --- Template with blocks ---

class AdminTemplateListResponse(BaseModel):
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
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Analytics ---

class PeriodData(BaseModel):
    purchases: int
    revenue: int
    prev_purchases: int  # same-length period before this one
    prev_revenue: int


class TemplateAnalyticsRow(BaseModel):
    template_id: uuid.UUID
    template_name: str
    slug: str
    created_by: str | None
    created_at: datetime
    total_purchases: int
    total_revenue: int  # paise
    p_7d: PeriodData
    p_30d: PeriodData
    p_90d: PeriodData
    p_365d: PeriodData
    p_this_year: PeriodData
    p_last_year: PeriodData

    model_config = {"from_attributes": True}


class AnalyticsSummary(BaseModel):
    total_revenue: int
    total_purchases: int
    s_7d: PeriodData
    s_30d: PeriodData
    s_90d: PeriodData
    s_365d: PeriodData
    s_this_year: PeriodData
    s_last_year: PeriodData
    top_template_name: str | None
    templates: list[TemplateAnalyticsRow]


class AdminTemplateDetailResponse(AdminTemplateListResponse):
    remotion_comp: str | None
    tag_labels: dict | None
    text_blocks: list[TextBlockResponse]
    image_blocks: list[ImageBlockResponse]

    model_config = {"from_attributes": True}
