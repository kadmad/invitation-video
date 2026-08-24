import httpx

from app.config import settings

META_GRAPH_API_VERSION = "v25.0"


def _meta_configured() -> bool:
    return all([settings.META_TOKEN, settings.META_PHONE_NUMBER_ID])


def _to_whatsapp_number(phone_number: str) -> str:
    """Meta wants the bare international number, no '+' — e.g. '91XXXXXXXXXX'."""
    return phone_number.lstrip("+")


def _send_whatsapp_template(phone_number: str, first_name: str, order_number: str) -> bool:
    """Send the approved "ordered" WhatsApp template via Meta's Graph API.
    Template has 2 body variables: {{1}} first name, {{2}} order number —
    same one template covers both the customer "render ready" notification
    and the admin "new manual render" alert."""
    if not _meta_configured():
        print(
            f"[WhatsApp] Meta not configured. Would send to {phone_number}: "
            f"name={first_name!r} order={order_number!r}"
        )
        return False

    to_number = _to_whatsapp_number(phone_number)
    url = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}/{settings.META_PHONE_NUMBER_ID}/messages"

    try:
        resp = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {settings.META_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "messaging_product": "whatsapp",
                "to": to_number,
                "type": "template",
                "template": {
                    "name": settings.META_WHATSAPP_TEMPLATE_NAME,
                    "language": {"code": settings.META_WHATSAPP_TEMPLATE_LANG},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [
                                {"type": "text", "text": first_name},
                                {"type": "text", "text": order_number},
                            ],
                        },
                    ],
                },
            },
            timeout=10,
        )
        if resp.status_code == 200:
            print(f"[WhatsApp] Sent to {phone_number}: {resp.text}")
            return True
        print(f"[WhatsApp] Failed to send to {phone_number}: {resp.status_code} {resp.text}")
        return False
    except Exception as e:
        print(f"[WhatsApp] Failed to send to {phone_number}: {e}")
        return False


def send_order_confirmation(phone_number: str, user_name: str, order_number: str):
    """Notify the customer their order was placed and paid for, via the
    "ordered" template. Fired from payments.py verify_payment on payment
    success — this is the only notification currently wired to Meta."""
    first_name = (user_name or "Customer").split()[0]
    return _send_whatsapp_template(phone_number, first_name, order_number)


def send_render_ready(phone_number: str, user_name: str, order_number: str):
    """Paused: no approved Meta template yet for "your video is ready".
    MSG91 is retired, so this is a no-op until a template is added."""
    print(f"[WhatsApp] send_render_ready paused (no Meta template yet) — {phone_number}")
    return False


def send_new_render_request(phone_number: str, user_name: str, template_name: str, order_number: str):
    """Paused: no approved Meta template yet for the admin "new manual
    render needed" alert. MSG91 is retired, so this is a no-op until a
    template is added."""
    print(f"[WhatsApp] send_new_render_request paused (no Meta template yet) — {phone_number}")
    return False
