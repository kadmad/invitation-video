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

    # Google Sign-In (OAuth 2.0 authorization code flow). Redirect URI is
    # supplied by the frontend per-request (mirrors the window.location
    # origin it's actually running on), not fixed here — Google itself
    # rejects any redirect_uri not pre-registered for this client_id.
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # S3 public URL (browser-accessible, defaults to localhost MinIO)
    S3_PUBLIC_URL: str | None = "http://localhost:9000"

    # Public CDN base URL for serving render output/pdf (R2 custom domain or
    # r2.dev public bucket URL). When unset, falls back to S3_PUBLIC_URL.
    CDN_BASE_URL: str | None = None

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RENDER_PRICE_PAISE: int = 9900

    # MSG91 (WhatsApp order/admin notifications) — replaced Twilio: MSG91
    # handles Indian DLT registration directly and is materially cheaper for
    # India-only traffic, which is all this app sends.
    MSG91_AUTH_KEY: str = ""
    # WhatsApp (Business API — see whatsapp_service.py). integrated_number is
    # the WhatsApp-enabled number registered to this MSG91 account. Template
    # must be pre-approved with a single body variable (body_1).
    MSG91_WHATSAPP_INTEGRATED_NUMBER: str = ""
    MSG91_WHATSAPP_TEMPLATE_NAME: str = ""
    MSG91_WHATSAPP_TEMPLATE_NAMESPACE: str = ""
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
