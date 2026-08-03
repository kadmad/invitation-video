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

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RENDER_PRICE_PAISE: int = 9900

    # OTP
    OTP_EXPIRE_SECONDS: int = 300
    OTP_MOCK: bool = True
    OTP_RATE_LIMIT_MAX: int = 3
    OTP_RATE_LIMIT_WINDOW: int = 600

    # App
    APP_NAME: str = "Invitation Video"
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    DEBUG: bool = True

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
