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
from app.workers.tasks import generate_pdf_only_task, render_video_task

router = APIRouter()


def _format_order_number(n: int) -> str:
    return f"INV-{n:06d}"


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

    # Use per-template price, fallback to global default
    amount = template.price or settings.RENDER_PRICE_PAISE
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
    )
    db.add(job)
    await db.flush()

    payment.render_job_id = job.id
    await db.commit()
    await db.refresh(job)

    if settings.SERVER_RENDERING:
        # Dispatch celery task
        task = render_video_task.delay(str(job.id))
        job.celery_task_id = task.id
        await db.commit()
    else:
        # Manual-render mode: no worker running to pick this up. Alert every
        # admin with a phone number on file; the order waits in the admin
        # panel's "Renders Awaiting" queue until one of them renders it
        # locally and uploads the result. Never let a notification failure
        # block the paid order from completing.
        order_number = _format_order_number(payment.order_number) if payment.order_number else str(payment.id)
        admins_result = await db.execute(
            select(User).where(User.is_admin == True, User.phone_number.isnot(None))  # noqa: E712
        )
        for admin in admins_result.scalars().all():
            try:
                whatsapp_service.send_new_render_request(
                    admin.phone_number, user.full_name or "Customer", tmpl.name if tmpl else "Template", order_number
                )
            except Exception:
                pass

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
