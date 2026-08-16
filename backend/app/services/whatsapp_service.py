import json

from app.config import settings


def _twilio_configured() -> bool:
    return all([settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, settings.TWILIO_WHATSAPP_FROM])


def _to_whatsapp_number(phone_number: str) -> str:
    return phone_number if phone_number.startswith("whatsapp:") else f"whatsapp:{phone_number}"


def send_render_ready(phone_number: str, user_name: str, render_job_id: str):
    """Send WhatsApp message with download link when render is complete."""
    if not _twilio_configured():
        print(f"[WhatsApp] Twilio not configured. Would notify {phone_number} for job {render_job_id}")
        return False

    from twilio.rest import Client

    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    download_url = f"{settings.APP_BASE_URL}/render/{render_job_id}"
    to_number = _to_whatsapp_number(phone_number)

    body_text = (
        f"Hey {user_name}! ✨\n\n"
        f"Your invitation video is ready and looks amazing!\n\n"
        f"\U0001F3AC *Download your video:*\n{download_url}\n\n"
        f"Share it with your loved ones and make your celebration special! \U0001F389\n\n"
        f"— {settings.APP_NAME}"
    )

    try:
        msg_kwargs = {
            "from_": settings.TWILIO_WHATSAPP_FROM,
            "to": to_number,
        }

        if settings.TWILIO_CONTENT_SID:
            # Generic single-variable Content Template ("{{1}}" as the whole
            # approved body) shared with send_new_render_request, so one
            # approved SID covers every notification this app sends.
            msg_kwargs["content_sid"] = settings.TWILIO_CONTENT_SID
            msg_kwargs["content_variables"] = json.dumps({"1": body_text})
        else:
            # Freeform message (works in sandbox within 24hr session window)
            msg_kwargs["body"] = body_text

        message = client.messages.create(**msg_kwargs)
        print(f"[WhatsApp] Sent to {phone_number}, SID: {message.sid}")
        return True
    except Exception as e:
        print(f"[WhatsApp] Failed to send to {phone_number}: {e}")
        return False


def send_new_render_request(phone_number: str, user_name: str, template_name: str, order_number: str):
    """Alert an admin that a new order needs a manual render (SERVER_RENDERING
    is off). Sent to every admin with a phone_number on file — best-effort,
    a failure here must never block the payment/order flow."""
    if not _twilio_configured():
        print(f"[WhatsApp] Twilio not configured. Would alert admin {phone_number} of order {order_number}")
        return False

    from twilio.rest import Client

    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    to_number = _to_whatsapp_number(phone_number)

    body_text = (
        f"\U0001F514 New render request — {order_number}\n\n"
        f"Customer: {user_name}\n"
        f"Template: {template_name}\n\n"
        f"It's in the admin panel's \"Renders Awaiting\" queue.\n\n"
        f"— {settings.APP_NAME}"
    )

    try:
        msg_kwargs = {
            "from_": settings.TWILIO_WHATSAPP_FROM,
            "to": to_number,
        }

        if settings.TWILIO_CONTENT_SID:
            # Reuses the same generic single-variable Content Template as
            # send_render_ready — the approved body is just "{{1}}", so any
            # notification text can go through it via content_variables.
            msg_kwargs["content_sid"] = settings.TWILIO_CONTENT_SID
            msg_kwargs["content_variables"] = json.dumps({"1": body_text})
        else:
            msg_kwargs["body"] = body_text

        message = client.messages.create(**msg_kwargs)
        print(f"[WhatsApp] Admin alert sent to {phone_number}, SID: {message.sid}")
        return True
    except Exception as e:
        print(f"[WhatsApp] Failed to alert admin {phone_number}: {e}")
        return False
