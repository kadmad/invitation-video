import logging
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import get_admin_user, get_current_user, get_db
from app.models.payment import Payment
from app.models.render_job import RenderJob
from app.models.template import Template
from app.models.user import User
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    InvoiceResponse,
    OrderResponse,
    RenderSummary,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
)
from app.services import payment_service, whatsapp_service
from app.utils.orders import format_order_number

logger = logging.getLogger(__name__)
from app.workers.tasks import generate_pdf_only_task, render_video_task

router = APIRouter()


def _format_order_number(n: int) -> str:
    return format_order_number(n)


INDIAN_MOBILE_PATTERN = re.compile(r"^[6-9]\d{9}$")


def _normalize_phone_number(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if not INDIAN_MOBILE_PATTERN.match(digits):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number")
    return f"+91{digits}"


@router.post("/create-order", response_model=CreateOrderResponse)
async def create_order(
    body: CreateOrderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate template exists and has video
    result = await db.execute(select(Template).where(Template.id == body.template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.video_key:
        raise HTTPException(status_code=400, detail="Template has no source video uploaded yet")

    # Phone number is collected once, at checkout, so order-confirmation
    # WhatsApp has somewhere to send to — asked only while the account has
    # none on file; never overwritten once set.
    if not user.phone_number:
        if not body.phone_number:
            raise HTTPException(status_code=400, detail="Phone number is required")
        normalized_phone = _normalize_phone_number(body.phone_number)
        existing = await db.execute(select(User).where(User.phone_number == normalized_phone))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="This phone number is already linked to another account")
        user.phone_number = normalized_phone

    # Use per-template price
    amount = template.price
    if body.is_watermarked:
        if not template.discount_amount_paise:
            raise HTTPException(status_code=400, detail="Watermark discount not available for this template")
        amount = max(amount - template.discount_amount_paise, 0)
    rz_order = payment_service.create_order(amount)

    # Save payment record with render params
    payment = Payment(
        user_id=user.id,
        razorpay_order_id=rz_order["id"],
        amount=amount,
        currency="INR",
        status="created",
        template_id=body.template_id,
        font_id=body.font_id,
        field_values=body.field_values,
        text_color_override=body.text_color_override,
        block_overrides=body.block_overrides,
        block_format_overrides=body.block_format_overrides,
        location_url=body.location_url,
        is_watermarked=body.is_watermarked,
        music_key=body.music_key,
        music_start_seconds=body.music_start_seconds,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return CreateOrderResponse(
        razorpay_order_id=rz_order["id"],
        amount=amount,
        currency="INR",
        key_id=settings.RAZORPAY_KEY_ID,
        payment_id=payment.id,
    )


@router.post("/verify", response_model=VerifyPaymentResponse)
async def verify_payment(
    body: VerifyPaymentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Load payment
    result = await db.execute(
        select(Payment).where(Payment.id == body.payment_id, Payment.user_id == user.id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status != "created":
        raise HTTPException(status_code=400, detail="Payment already processed")

    # Verify Razorpay signature
    valid = payment_service.verify_signature(
        body.razorpay_order_id,
        body.razorpay_payment_id,
        body.razorpay_signature,
    )
    if not valid:
        payment.status = "failed"
        await db.commit()
        raise HTTPException(status_code=400, detail="Payment verification failed")

    # Update payment
    payment.status = "paid"
    payment.razorpay_payment_id = body.razorpay_payment_id
    payment.razorpay_signature = body.razorpay_signature

    # Check if template has PDF snapshots configured
    tmpl_result = await db.execute(select(Template).where(Template.id == payment.template_id))
    tmpl = tmpl_result.scalar_one_or_none()
    has_pdf = bool(tmpl and tmpl.pdf_snapshot_timestamps)

    job = RenderJob(
        user_id=user.id,
        template_id=payment.template_id,
        font_id=payment.font_id,
        field_values=payment.field_values,
        text_color_override=payment.text_color_override,
        block_overrides=payment.block_overrides,
        block_format_overrides=payment.block_format_overrides,
        location_url=payment.location_url,
        status="pending",
        pdf_status="queued" if has_pdf else None,
        render_method="server" if settings.SERVER_RENDERING else "manual",
        is_watermarked=payment.is_watermarked,
        music_key=payment.music_key,
        music_start_seconds=payment.music_start_seconds,
    )
    db.add(job)
    await db.flush()

    payment.render_job_id = job.id
    await db.commit()
    await db.refresh(job)

    # Dispatch celery task. Even in manual mode (SERVER_RENDERING=false, no
    # worker on this server by design) this is safe and correct: the task
    # lands durably in Redis and simply sits queued until any connected
    # local worker (admin's machine, wired to prod Redis/Postgres/S3 over
    # Tailscale) picks it up — no admin click required. Multiple local
    # workers online at once each pull the next queued job on their own
    # (Redis list pop is atomic), so the queue naturally drains oldest-first
    # across however many machines are connected, one job per machine at a
    # time (worker_concurrency=1). See celery_app.py for crash-recovery
    # settings (task_acks_late + reject_on_worker_lost + visibility_timeout)
    # that requeue a job automatically if the worker handling it dies
    # mid-render, instead of leaving it stuck.
    task = render_video_task.delay(str(job.id))
    job.celery_task_id = task.id
    await db.commit()

    order_number = _format_order_number(payment.order_number) if payment.order_number else str(payment.id)

    # Notifications are best-effort: the payment is already captured and the
    # render already dispatched, so nothing here may raise into the response.
    # send_* never raises on its own — this catch is the backstop, and it logs
    # rather than swallowing, so a silently unnotified customer is diagnosable.
    if user.phone_number:
        try:
            whatsapp_service.send_order_confirmation(user.phone_number, user.full_name or "Customer", order_number)
        except Exception:
            logger.exception("[WhatsApp] Order confirmation failed for order %s", order_number)

    if not settings.SERVER_RENDERING:
        # Manual-render mode: still alert every admin with a phone number on
        # file as a heads-up (e.g. to prompt them to bring a worker online
        # if none is currently connected) — the render above proceeds on
        # its own regardless. Never let a notification failure block the
        # paid order from completing.
        admins_result = await db.execute(
            select(User).where(User.is_admin == True, User.phone_number.isnot(None))  # noqa: E712
        )
        for admin in admins_result.scalars().all():
            try:
                whatsapp_service.send_new_render_request(
                    admin.phone_number, user.full_name or "Customer", tmpl.name if tmpl else "Template", order_number
                )
            except Exception:
                logger.exception(
                    "[WhatsApp] Admin manual-render alert failed for order %s", order_number
                )

    return VerifyPaymentResponse(
        render_job_id=job.id,
        status="paid",
    )


@router.post("/admin-render", response_model=VerifyPaymentResponse)
async def admin_render(
    body: CreateOrderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_admin_user),
):
    result = await db.execute(select(Template).where(Template.id == body.template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.video_key:
        raise HTTPException(status_code=400, detail="Template has no source video uploaded yet")

    has_pdf = bool(template.pdf_snapshot_timestamps)
    job = RenderJob(
        user_id=user.id,
        template_id=body.template_id,
        font_id=body.font_id,
        field_values=body.field_values,
        text_color_override=body.text_color_override,
        block_overrides=body.block_overrides,
        block_format_overrides=body.block_format_overrides,
        location_url=body.location_url,
        status="completed" if body.skip_render else "pending",
        progress=100 if body.skip_render else 0,
        pdf_status="queued" if has_pdf else None,
        music_key=body.music_key,
        music_start_seconds=body.music_start_seconds,
    )
    db.add(job)
    await db.flush()

    payment = Payment(
        user_id=user.id,
        razorpay_order_id=f"admin_{uuid.uuid4().hex[:16]}",
        amount=0,
        currency="INR",
        status="paid",
        template_id=body.template_id,
        font_id=body.font_id,
        field_values=body.field_values,
        text_color_override=body.text_color_override,
        block_overrides=body.block_overrides,
        block_format_overrides=body.block_format_overrides,
        location_url=body.location_url,
        render_job_id=job.id,
        music_key=body.music_key,
        music_start_seconds=body.music_start_seconds,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(job)

    if body.skip_render:
        generate_pdf_only_task.delay(str(job.id))
    else:
        task = render_video_task.delay(str(job.id))
        job.celery_task_id = task.id
        await db.commit()

    return VerifyPaymentResponse(
        render_job_id=job.id,
        status="completed" if body.skip_render else "rendering",
    )


@router.get("/orders", response_model=list[OrderResponse])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment)
        .where(Payment.user_id == user.id)
        .options(selectinload(Payment.render_job), selectinload(Payment.template))
        .order_by(Payment.created_at.desc())
    )
    payments = result.scalars().all()

    orders = []
    for p in payments:
        render = None
        if p.render_job:
            render = RenderSummary(
                id=p.render_job.id,
                status=p.render_job.status,
                progress=p.render_job.progress,
                output_key=p.render_job.output_key,
                pdf_key=p.render_job.pdf_key,
                pdf_status=p.render_job.pdf_status,
            )
        orders.append(
            OrderResponse(
                id=p.id,
                order_number=_format_order_number(p.order_number),
                razorpay_order_id=p.razorpay_order_id,
                amount=p.amount,
                currency=p.currency,
                status=p.status,
                created_at=p.created_at,
                template_name=p.template.name if p.template else "Unknown",
                render=render,
                field_values=p.field_values,
            )
        )
    return orders


@router.get("/orders/{payment_id}/invoice", response_model=InvoiceResponse)
async def get_invoice(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id, Payment.user_id == user.id)
        .options(selectinload(Payment.template))
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    return InvoiceResponse(
        order_number=_format_order_number(payment.order_number),
        date=payment.created_at,
        user_name=user.full_name,
        user_email=user.email,
        template_name=payment.template.name if payment.template else "Unknown",
        field_values=payment.field_values,
        amount=payment.amount,
        currency=payment.currency,
        razorpay_payment_id=payment.razorpay_payment_id,
        status=payment.status,
    )
