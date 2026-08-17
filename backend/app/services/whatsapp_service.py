import httpx

from app.config import settings

MSG91_WHATSAPP_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/"


def _msg91_whatsapp_configured() -> bool:
    return all([
        settings.MSG91_AUTH_KEY,
        settings.MSG91_WHATSAPP_INTEGRATED_NUMBER,
        settings.MSG91_WHATSAPP_TEMPLATE_NAME,
        settings.MSG91_WHATSAPP_TEMPLATE_NAMESPACE,
    ])


def _to_msg91_mobile(phone_number: str) -> str:
    """MSG91 wants the bare international number, no '+' — e.g. '91XXXXXXXXXX'."""
    return phone_number.lstrip("+")


def _send_whatsapp_template(phone_number: str, body_text: str) -> bool:
    """Send an approved WhatsApp template message via MSG91's Business API.
    The template must be pre-approved with a single body variable
    (body_1) — same generic single-variable pattern the old Twilio Content
    Template used, so this one approved template covers every notification
    this app sends."""
    if not _msg91_whatsapp_configured():
        print(f"[WhatsApp] MSG91 not configured. Would send to {phone_number}: {body_text!r}")
        return False

    to_number = _to_msg91_mobile(phone_number)

    try:
        resp = httpx.post(
            MSG91_WHATSAPP_URL,
            headers={"authkey": settings.MSG91_AUTH_KEY, "Content-Type": "application/json"},
            json={
                "integrated_number": settings.MSG91_WHATSAPP_INTEGRATED_NUMBER,
                "content_type": "template",
                "payload": {
                    "messaging_product": "whatsapp",
                    "type": "template",
                    "template": {
                        "name": settings.MSG91_WHATSAPP_TEMPLATE_NAME,
                        "language": {"code": "en", "policy": "deterministic"},
                        "namespace": settings.MSG91_WHATSAPP_TEMPLATE_NAMESPACE,
                        "to_and_components": [
                            {
                                "to": [to_number],
                                "components": {
                                    "body_1": {"type": "text", "value": body_text},
                                },
                            },
                        ],
                    },
                },
            },
            timeout=10,
        )
        if resp.status_code in (200, 202):
            print(f"[WhatsApp] Sent to {phone_number}: {resp.text}")
            return True
        print(f"[WhatsApp] Failed to send to {phone_number}: {resp.status_code} {resp.text}")
        return False
    except Exception as e:
        print(f"[WhatsApp] Failed to send to {phone_number}: {e}")
        return False


def send_render_ready(phone_number: str, user_name: str, render_job_id: str):
    """Send WhatsApp message with download link when render is complete."""
    download_url = f"{settings.APP_BASE_URL}/render/{render_job_id}"
    body_text = (
        f"Hey {user_name}! ✨\n\n"
        f"Your invitation video is ready and looks amazing!\n\n"
        f"\U0001F3AC *Download your video:*\n{download_url}\n\n"
        f"Share it with your loved ones and make your celebration special! \U0001F389\n\n"
        f"— {settings.APP_NAME}"
    )
    return _send_whatsapp_template(phone_number, body_text)


def send_new_render_request(phone_number: str, user_name: str, template_name: str, order_number: str):
    """Alert an admin that a new order needs a manual render (SERVER_RENDERING
    is off). Sent to every admin with a phone_number on file — best-effort,
    a failure here must never block the payment/order flow."""
    body_text = (
        f"\U0001F514 New render request — {order_number}\n\n"
        f"Customer: {user_name}\n"
        f"Template: {template_name}\n\n"
        f"It's in the admin panel's \"Renders Awaiting\" queue.\n\n"
        f"— {settings.APP_NAME}"
    )
    return _send_whatsapp_template(phone_number, body_text)
