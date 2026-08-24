import uuid
from datetime import datetime

from pydantic import BaseModel


class CreateOrderRequest(BaseModel):
    template_id: uuid.UUID
    font_id: uuid.UUID | None = None
    field_values: dict[str, str]
    text_color_override: dict[str, str] | None = None
    block_overrides: dict[str, str] | None = None
    block_format_overrides: dict | None = None
    location_url: str | None = None
    skip_render: bool = False
    is_watermarked: bool = False
    music_key: str | None = None
    music_start_seconds: float | None = None
    # Only required the first time — once a user has a phone_number on file,
    # the frontend stops asking and this is omitted on later orders.
    phone_number: str | None = None


class CreateOrderResponse(BaseModel):
    razorpay_order_id: str
    amount: int
    currency: str
    key_id: str
    payment_id: uuid.UUID  # our internal Payment.id


class VerifyPaymentRequest(BaseModel):
    payment_id: uuid.UUID  # our internal Payment.id
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class VerifyPaymentResponse(BaseModel):
    render_job_id: uuid.UUID
    status: str


class RenderSummary(BaseModel):
    id: uuid.UUID
    status: str
    progress: int
    output_key: str | None
    pdf_key: str | None
    pdf_status: str | None

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: uuid.UUID
    order_number: str  # formatted INV-000001
    razorpay_order_id: str
    amount: int
    currency: str
    status: str
    created_at: datetime
    template_name: str
    render: RenderSummary | None
    field_values: dict[str, str]

    model_config = {"from_attributes": True}


class InvoiceResponse(BaseModel):
    order_number: str  # formatted INV-000001
    date: datetime
    user_name: str
    user_email: str
    template_name: str
    field_values: dict[str, str]
    amount: int
    currency: str
    razorpay_payment_id: str | None
    status: str

    model_config = {"from_attributes": True}
