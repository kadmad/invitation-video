import re
import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

# 8+ chars, letters and digits only (no special characters required or allowed).
PASSWORD_PATTERN = re.compile(r"^[A-Za-z0-9]{8,}$")


def _check_password_strength(password: str) -> str:
    if not PASSWORD_PATTERN.match(password):
        raise ValueError("Password must be at least 8 characters, letters and numbers only")
    return password


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str | None
    phone_number: str | None
    full_name: str
    first_name: str | None = None
    last_name: str | None = None
    avatar_url: str | None = None
    is_active: bool
    is_admin: bool
    has_password: bool = False
    terms_accepted_at: datetime | None = None
    terms_version: str | None = None

    model_config = {"from_attributes": True}


class GoogleAuthRequest(BaseModel):
    code: str
    redirect_uri: str
    accepted_terms: bool = False


class GoogleAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool


class EmailLoginRequest(BaseModel):
    email: str
    password: str


class SetPasswordRequest(BaseModel):
    # Required only when the account already has a password set — enforced
    # in the endpoint (not here) since that depends on the current user.
    current_password: str | None = None
    new_password: str

    _validate_new_password = field_validator("new_password")(_check_password_strength)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UpdateProfileRequest(BaseModel):
    full_name: str
    first_name: str | None = None
    last_name: str | None = None

    @field_validator("full_name")
    @classmethod
    def _full_name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name cannot be empty")
        return v
