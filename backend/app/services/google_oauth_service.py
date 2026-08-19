import asyncio

import httpx
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.config import settings

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


async def exchange_code_for_claims(code: str, redirect_uri: str) -> dict:
    """Exchanges an OAuth authorization code for Google's ID token, verifies
    its signature against Google's published keys, and returns the decoded
    claims (sub, email, given_name, family_name, name, picture, ...)."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        raise ValueError("Google sign-in failed: could not exchange code")

    id_token_str = resp.json().get("id_token")
    if not id_token_str:
        raise ValueError("Google sign-in failed: no ID token returned")

    # verify_oauth2_token fetches/caches Google's public certs over HTTP —
    # run off the event loop so a slow first fetch doesn't block other requests.
    return await asyncio.to_thread(
        google_id_token.verify_oauth2_token,
        id_token_str,
        google_requests.Request(),
        settings.GOOGLE_CLIENT_ID,
    )
