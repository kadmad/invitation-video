import uuid
from datetime import datetime

from pydantic import BaseModel


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
