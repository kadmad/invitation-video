import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str | None
    phone_number: str | None
    full_name: str
    is_active: bool
    is_admin: bool
    terms_accepted_at: datetime | None = None
    terms_version: str | None = None

    model_config = {"from_attributes": True}


class SendOTPRequest(BaseModel):
    phone_number: str


class SendOTPResponse(BaseModel):
    message: str
    expires_in: int


class VerifyOTPRequest(BaseModel):
    phone_number: str
    otp: str
    accepted_terms: bool = False


class VerifyOTPResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool
