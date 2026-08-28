import logging

import httpx

from app.config import settings

META_GRAPH_API_VERSION = "v25.0"

logger = logging.getLogger(__name__)


def _meta_configured() -> bool:
    return all([settings.META_TOKEN, settings.META_PHONE_NUMBER_ID])


def _to_whatsapp_number(phone_number: str) -> str:
    """Meta wants the bare international number, no '+' — e.g. '91XXXXXXXXXX'."""
    return phone_number.strip().lstrip("+")


def _first_name(user_name: str | None) -> str:
    """First word of a name, for templates that greet the customer. Falls back
    to "Customer" for a missing, empty or whitespace-only name — `.split()[0]`
    on a blank string raises IndexError, and a notification must never be the
    thing that breaks a finished order."""
    parts = (user_name or "").split()
    return parts[0] if parts else "Customer"


def _send_template(
    phone_number: str,
    template_name: str,
    language: str,
    body_params: list[str],
    url_button_param: str | None = None,
) -> bool:
    """Send one approved Meta template via the Graph API. Returns True only on
    a 200 from Meta; every other outcome is logged and returns False.

    This function never raises. Notifications are a side effect of work that is
    already finished and paid for — a failed send must never propagate into the
    caller's transaction, task or HTTP response. Callers can therefore treat a
    False return as "customer wasn't messaged", and nothing more.

    `body_params` fill the template's {{1}}, {{2}}, ... in order — Meta rejects
    the entire message (error 132000) when the count doesn't match what the
    template was approved with, so each caller owns its own list.

    `url_button_param` fills the dynamic suffix of a URL button, for templates
    that have one; the button component is omitted entirely otherwise.
    """
    try:
        if not phone_number or not phone_number.strip():
            logger.warning(
                "[WhatsApp] Skipped %r: no phone number on the recipient", template_name
            )
            return False

        if not _meta_configured():
            logger.info(
                "[WhatsApp] Meta not configured. Would send template %r to %s: "
                "params=%r button=%r",
                template_name, phone_number, body_params, url_button_param,
            )
            return False

        to_number = _to_whatsapp_number(phone_number)
        url = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}/{settings.META_PHONE_NUMBER_ID}/messages"

        components: list[dict] = [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": value} for value in body_params],
            }
        ]
        if url_button_param is not None:
            components.append(
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [{"type": "text", "text": url_button_param}],
                }
            )

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
                        "name": template_name,
                        "language": {"code": language},
                        "components": components,
                    },
                },
                timeout=10,
            )
        except httpx.HTTPError as e:
            # Network-level failure: DNS, TLS, connect/read timeout. Expected
            # enough not to warrant a traceback, but it means the customer got
            # nothing, so it is a warning rather than info.
            logger.warning(
                "[WhatsApp] Transport error sending %r to %s: %s: %s",
                template_name, phone_number, type(e).__name__, e,
            )
            return False

        if resp.status_code == 200:
            logger.info("[WhatsApp] Sent %r to %s: %s", template_name, phone_number, resp.text)
            return True

        # Meta answered but refused. The body carries the actionable reason —
        # e.g. 132001 template not found/not yet approved, 132000 parameter
        # count mismatch, 131030 number not on the allowed list in test mode.
        logger.warning(
            "[WhatsApp] Meta rejected %r for %s: HTTP %s %s",
            template_name, phone_number, resp.status_code, resp.text,
        )
        return False
    except Exception:
        # Anything not anticipated above (bad payload shape, a settings value
        # of the wrong type, ...). Logged with a traceback so it is diagnosable,
        # swallowed so it cannot damage the caller.
        logger.exception(
            "[WhatsApp] Unexpected error sending %r to %s", template_name, phone_number
        )
        return False


def send_order_confirmation(phone_number: str, user_name: str, order_number: str) -> bool:
    """Notify the customer their order was placed and paid for, via the
    "ordered" template ({{1}} first name, {{2}} order number). Fired from
    payments.py verify_payment on payment success. Never raises."""
    return _send_template(
        phone_number,
        settings.META_WHATSAPP_TEMPLATE_NAME,
        settings.META_WHATSAPP_TEMPLATE_LANG,
        [_first_name(user_name), order_number],
    )


def send_render_ready(
    phone_number: str,
    user_name: str,
    order_number: str,
    watch_url: str | None = None,
) -> bool:
    """Notify the customer their video is ready, via the
    "delivery_confirmation" template ({{1}} first name, {{2}} order number).
    Never raises.

    Goes to the phone number captured at checkout — payments.py writes it onto
    the user before creating the Razorpay order — and fires on every path that
    can move a job to "completed":
      - the Celery worker, whether it runs on the server (SERVER_RENDERING=true)
        or on a machine draining the manual queue (docker-compose.local-worker)
      - an admin uploading a hand-rendered file from /admin/renders

    `watch_url` is the public /watch/{job_id} page for the finished video. It
    is only sent when the template actually has a dynamic URL button — passing
    a button component to a template without one is rejected outright, so this
    stays unused until the approved template gains that button.
    """
    return _send_template(
        phone_number,
        settings.META_WHATSAPP_DELIVERY_TEMPLATE_NAME,
        settings.META_WHATSAPP_DELIVERY_TEMPLATE_LANG,
        [_first_name(user_name), order_number],
    )


def send_new_render_request(
    phone_number: str, user_name: str, template_name: str, order_number: str
) -> bool:
    """Paused: no approved Meta template yet for the admin "new manual
    render needed" alert. MSG91 is retired, so this is a no-op until a
    template is added."""
    logger.info(
        "[WhatsApp] send_new_render_request paused (no Meta template yet) — %s", phone_number
    )
    return False
