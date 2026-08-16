import re

from app.config import settings


def _twilio_sms_configured() -> bool:
    return all([settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, settings.TWILIO_SMS_FROM])


def send_otp_sms(phone_number: str) -> str | None:
    """Login OTP via plain SMS (not WhatsApp) through Twilio's Messages API.

    Body is the literal string "sms_2fa" — on a Twilio TRIAL account this is
    a recognized predefined-template keyword: Twilio itself generates a
    random code and returns the resolved text (e.g. "Your verification code
    is 482913...") in the response body, rather than us supplying our own
    code. So the code that must be verified is whatever Twilio put in its
    response, not one we chose — that's why this returns the code string
    (or None on failure) instead of a plain bool.

    Once this account moves off the trial plan, "sms_2fa" stops being a
    magic keyword and would just be sent as literal text — at that point
    this needs to go back to generating our own code and putting it in a
    real message body (like send_otp_sms used to, and like the WhatsApp
    functions in whatsapp_service.py already do)."""
    if not _twilio_sms_configured():
        print(f"[SMS] Twilio SMS not configured. Would send OTP to {phone_number}")
        return None

    from twilio.rest import Client

    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    try:
        message = client.messages.create(
            from_=settings.TWILIO_SMS_FROM,
            to=phone_number,
            body="sms_2fa",
        )
        match = re.search(r"\b(\d{6})\b", message.body or "")
        if not match:
            print(f"[SMS] Sent to {phone_number} but couldn't find a code in the response body: {message.body!r}")
            return None
        print(f"[SMS] OTP sent to {phone_number}, SID: {message.sid}")
        return match.group(1)
    except Exception as e:
        print(f"[SMS] Failed to send OTP to {phone_number}: {e}")
        return None
