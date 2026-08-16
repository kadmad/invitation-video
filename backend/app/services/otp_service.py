import logging

import redis.asyncio as redis

from app.config import settings
from app.services.sms_service import send_otp_sms

logger = logging.getLogger(__name__)

_redis: redis.Redis | None = None

MOCK_CODE = "123456"


def _bypass_numbers() -> set[str]:
    return {n.strip() for n in settings.OTP_BYPASS_NUMBERS.split(",") if n.strip()}


async def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def generate_otp(phone: str) -> str:
    r = await get_redis()

    # Rate limit check
    rate_key = f"otp_rate:{phone}"
    count = await r.get(rate_key)
    if count and int(count) >= settings.OTP_RATE_LIMIT_MAX:
        raise ValueError("Too many OTP requests. Try again later.")

    if settings.OTP_MOCK:
        code = MOCK_CODE
        logger.info("OTP for %s: %s (mock)", phone, code)
    else:
        # Twilio's trial-account SMS template picks the code itself (see
        # sms_service.send_otp_sms) — we store whatever it actually sent,
        # not one we generate ourselves.
        code = send_otp_sms(phone)
        if not code:
            if phone in _bypass_numbers():
                # Real send failed (e.g. this number isn't a verified
                # recipient on the trial account yet) — this number can
                # always fall back to the mock code, so don't hard-fail the
                # request; just let it through without a real code stored.
                logger.warning("SMS send failed for bypass number %s; falling back to mock code", phone)
                code = MOCK_CODE
            else:
                raise RuntimeError("Couldn't send the verification code. Try again in a moment.")

    # Store OTP
    otp_key = f"otp:{phone}"
    await r.setex(otp_key, settings.OTP_EXPIRE_SECONDS, code)

    # Increment rate limit counter
    pipe = r.pipeline()
    pipe.incr(rate_key)
    pipe.expire(rate_key, settings.OTP_RATE_LIMIT_WINDOW)
    await pipe.execute()

    return code


async def verify_otp(phone: str, code: str) -> bool:
    r = await get_redis()
    otp_key = f"otp:{phone}"
    stored = await r.get(otp_key)

    # Known test/owner numbers may always use the mock code, even when a
    # real one was actually sent — lets real-OTP mode stay on without
    # locking out the couple of accounts we test with directly.
    if code == MOCK_CODE and phone in _bypass_numbers():
        if stored is not None:
            await r.delete(otp_key)
        return True

    if stored is None:
        return False
    if stored != code:
        return False
    await r.delete(otp_key)
    return True
