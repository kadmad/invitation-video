import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    SendOTPRequest,
    SendOTPResponse,
    TokenResponse,
    UserResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)
from app.services.otp_service import generate_otp, verify_otp
from app.utils.security import create_access_token, hash_password, verify_password

router = APIRouter()

PHONE_REGEX = re.compile(r"^\+?\d{10,15}$")


def normalize_phone(phone: str) -> str:
    digits = re.sub(r"[^\d]", "", phone)
    if len(digits) == 10:
        return "+91" + digits
    if len(digits) == 12 and digits.startswith("91"):
        return "+" + digits
    return "+" + digits


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(body: SendOTPRequest):
    phone = normalize_phone(body.phone_number)
    raw_digits = re.sub(r"[^\d]", "", phone)
    if len(raw_digits) < 10 or len(raw_digits) > 15:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    try:
        await generate_otp(phone)
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))

    return SendOTPResponse(
        message="OTP sent successfully",
        expires_in=settings.OTP_EXPIRE_SECONDS,
    )


@router.post("/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp_endpoint(body: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    phone = normalize_phone(body.phone_number)
    valid = await verify_otp(phone, body.otp)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")

    # Find or create user
    result = await db.execute(select(User).where(User.phone_number == phone))
    user = result.scalar_one_or_none()
    is_new_user = False

    if not user:
        user = User(
            phone_number=phone,
            full_name="User",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        is_new_user = True

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token(str(user.id))
    return VerifyOTPResponse(
        access_token=token,
        is_new_user=is_new_user,
    )


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user
