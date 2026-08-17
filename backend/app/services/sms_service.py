import httpx

from app.config import settings

MSG91_FLOW_URL = "https://api.msg91.com/api/v5/flow/"


def _msg91_sms_configured() -> bool:
    return all([settings.MSG91_AUTH_KEY, settings.MSG91_SMS_FLOW_ID, settings.MSG91_SMS_SENDER_ID])


def _to_msg91_mobile(phone_number: str) -> str:
    """MSG91 wants the bare international number, no '+' — e.g. '91XXXXXXXXXX'."""
    return phone_number.lstrip("+")


def send_otp_sms(phone_number: str, code: str) -> bool:
    """Send a login OTP via MSG91's Flow API — DLT-compliant templated SMS.

    flow_id maps to the DLT-approved template configured on the MSG91
    dashboard; its single variable placeholder must be named VAR1. Unlike
    the old Twilio trial-account setup (which generated the code itself and
    required parsing it back out of the response body), we generate the
    code ourselves in otp_service.generate_otp and just send it here."""
    if not _msg91_sms_configured():
        print(f"[SMS] MSG91 not configured. Would send OTP {code} to {phone_number}")
        return False

    try:
        resp = httpx.post(
            MSG91_FLOW_URL,
            headers={"authkey": settings.MSG91_AUTH_KEY, "Content-Type": "application/json"},
            json={
                "flow_id": settings.MSG91_SMS_FLOW_ID,
                "sender": settings.MSG91_SMS_SENDER_ID,
                "recipients": [
                    {"mobiles": _to_msg91_mobile(phone_number), "VAR1": code},
                ],
            },
            timeout=10,
        )
        data = resp.json()
        if resp.status_code == 200 and data.get("type") == "success":
            print(f"[SMS] OTP sent to {phone_number}, id: {data.get('message')}")
            return True
        print(f"[SMS] Failed to send OTP to {phone_number}: {resp.status_code} {data}")
        return False
    except Exception as e:
        print(f"[SMS] Failed to send OTP to {phone_number}: {e}")
        return False
