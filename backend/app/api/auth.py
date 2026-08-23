from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.auth import (
    EmailLoginRequest,
    GoogleAuthRequest,
    GoogleAuthResponse,
    SetPasswordRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
)
from app.services import google_oauth_service
from app.utils.security import create_access_token, hash_password, verify_password

router = APIRouter()


@router.post("/google", response_model=GoogleAuthResponse)
async def google_auth(body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    try:
        claims = await google_oauth_service.exchange_code_for_claims(body.code, body.redirect_uri)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    google_id = claims["sub"]
    email = claims.get("email")
    email_verified = claims.get("email_verified", False)
    first_name = claims.get("given_name") or None
    last_name = claims.get("family_name") or None
    avatar_url = claims.get("picture")
    full_name = claims.get("name") or " ".join(filter(None, [first_name, last_name])) or "Google User"

    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()
    is_new_user = False

    if not user and email and email_verified:
        # Link to an existing account (e.g. phone/OTP signup) that used the
        # same, Google-verified email address.
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if not user:
        if not body.accepted_terms:
            raise HTTPException(
                status_code=400,
                detail="You must accept the Terms & Conditions and Privacy Policy to create an account",
            )
        user = User(
            google_id=google_id,
            email=email,
            full_name=full_name,
            first_name=first_name,
            last_name=last_name,
            avatar_url=avatar_url,
            terms_accepted_at=datetime.now(timezone.utc),
            terms_version=settings.TERMS_VERSION,
        )
        db.add(user)
        is_new_user = True
    else:
        user.google_id = google_id
        if email:
            user.email = email
        if first_name:
            user.first_name = first_name
        if last_name:
            user.last_name = last_name
        if avatar_url:
            user.avatar_url = avatar_url
        if body.accepted_terms and (
            user.terms_accepted_at is None or user.terms_version != settings.TERMS_VERSION
        ):
            user.terms_accepted_at = datetime.now(timezone.utc)
            user.terms_version = settings.TERMS_VERSION

    await db.commit()
    await db.refresh(user)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token(str(user.id))
    return GoogleAuthResponse(access_token=token, is_new_user=is_new_user)


@router.post("/login", response_model=TokenResponse)
async def login(body: EmailLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/set-password", response_model=UserResponse)
async def set_password(
    body: SetPasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.email:
        raise HTTPException(status_code=400, detail="Add an email to your account before setting a password")

    if user.hashed_password:
        if not body.current_password or not verify_password(body.current_password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Current password is incorrect")

    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.full_name = body.full_name
    user.first_name = body.first_name
    user.last_name = body.last_name
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user
