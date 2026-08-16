from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://invitation:invitation_secret@postgres:5432/invitation_video"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # S3 / MinIO
    S3_ENDPOINT_URL: str | None = "http://minio:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin123"
    S3_BUCKET_NAME: str = "invitation-video"
    S3_REGION: str = "us-east-1"

    # JWT
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440

    # S3 public URL (browser-accessible, defaults to localhost MinIO)
    S3_PUBLIC_URL: str | None = "http://localhost:9000"

    # Public CDN base URL for serving render output/pdf (R2 custom domain or
    # r2.dev public bucket URL). When unset, falls back to S3_PUBLIC_URL.
    CDN_BASE_URL: str | None = None

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RENDER_PRICE_PAISE: int = 9900

    # OTP
    OTP_EXPIRE_SECONDS: int = 300
    OTP_MOCK: bool = True  # True: always "123456", no SMS sent. False: real random code sent via Twilio SMS.
    OTP_RATE_LIMIT_MAX: int = 3
    OTP_RATE_LIMIT_WINDOW: int = 600
    # Comma-separated phone numbers (E.164, e.g. "+919999999999,+918888888888")
    # that may ALSO log in with "123456" even when OTP_MOCK is False and a
    # real code was sent — a controlled bypass for known test/owner accounts
    # so real-OTP mode can be enabled without locking them out.
    OTP_BYPASS_NUMBERS: str = ""

    # Twilio (WhatsApp notifications + SMS OTP)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = ""  # e.g. "whatsapp:+17372212163"
    TWILIO_CONTENT_SID: str = ""  # Content Template SID (e.g. HXa9d0fd...)
    TWILIO_SMS_FROM: str = ""  # plain SMS-capable number, e.g. "+17372508034" (separate from the WhatsApp number)
    APP_BASE_URL: str = "http://localhost:5173"  # frontend URL for download links

    # App
    APP_NAME: str = "Bring My Matter"
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    DEBUG: bool = True
    TERMS_VERSION: str = "2026-08-15"

    # When False, paid orders are NOT auto-dispatched to the render worker.
    # Instead all admins get a WhatsApp alert and the order sits in the admin
    # "Renders Awaiting" queue for manual fulfillment (render locally, then
    # upload the finished video/PDF through the admin panel). Lets hosting
    # skip running worker/renderer compute until volume justifies it.
    SERVER_RENDERING: bool = True
    # Absolute ceiling communicated to the user while waiting on a manual render.
    MANUAL_RENDER_MAX_HOURS: int = 24

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
