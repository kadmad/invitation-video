import logging

import redis.asyncio as redis

from app.config import settings

logger = logging.getLogger(__name__)

_redis: redis.Redis | None = None


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

    # Mock OTP for dev
    code = "123456"
    logger.info("OTP for %s: %s", phone, code)

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
    if stored is None:
        return False
    if stored != code:
        return False
    await r.delete(otp_key)
    return True
