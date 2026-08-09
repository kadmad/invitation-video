from app.config import settings


def send_render_ready(phone_number: str, user_name: str, render_job_id: str):
    """Send WhatsApp message with download link when render is complete."""
    if not all([settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, settings.TWILIO_WHATSAPP_FROM]):
        print(f"[WhatsApp] Twilio not configured. Would notify {phone_number} for job {render_job_id}")
        return False

    from twilio.rest import Client

    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    download_url = f"{settings.APP_BASE_URL}/render/{render_job_id}"
    to_number = phone_number if phone_number.startswith("whatsapp:") else f"whatsapp:{phone_number}"

    try:
        msg_kwargs = {
            "from_": settings.TWILIO_WHATSAPP_FROM,
            "to": to_number,
        }

        if settings.TWILIO_CONTENT_SID:
            # Use approved Content Template
            msg_kwargs["content_sid"] = settings.TWILIO_CONTENT_SID
            msg_kwargs["content_variables"] = f'{{"1":"{user_name}","2":"{download_url}"}}'
        else:
            # Freeform message (works in sandbox within 24hr session window)
            msg_kwargs["body"] = (
                f"Hey {user_name}! \u2728\n\n"
                f"Your invitation video is ready and looks amazing!\n\n"
                f"\U0001F3AC *Download your video:*\n{download_url}\n\n"
                f"Share it with your loved ones and make your celebration special! \U0001F389\n\n"
                f"\u2014 {settings.APP_NAME}"
            )

        message = client.messages.create(**msg_kwargs)
        print(f"[WhatsApp] Sent to {phone_number}, SID: {message.sid}")
        return True
    except Exception as e:
        print(f"[WhatsApp] Failed to send to {phone_number}: {e}")
        return False
