import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

LANGUAGE_TO_ITC = {
    "hindi": "hi-t-i0-und",
    "gujarati": "gu-t-i0-und",
}

GOOGLE_URL = "https://inputtools.google.com/request"


async def _google_transliterate(text: str, itc: str) -> str:
    """Transliterate using Google Input Tools API. Returns best suggestion."""
    # Split into words, transliterate each
    words = text.strip().split()
    if not words:
        return text

    results = []
    async with httpx.AsyncClient(timeout=10) as client:
        for word in words:
            resp = await client.get(
                GOOGLE_URL,
                params={"text": word, "itc": itc, "num": 1},
            )
            data = resp.json()
            if data[0] == "SUCCESS" and data[1] and data[1][0][1]:
                results.append(data[1][0][1][0])  # First suggestion
            else:
                results.append(word)  # Keep original if API fails

    return " ".join(results)


class TransliterateRequest(BaseModel):
    text: str
    language: str


class TransliterateResponse(BaseModel):
    original: str
    transliterated: str
    language: str


class TransliterateBatchRequest(BaseModel):
    values: dict[str, str]
    language: str


class TransliterateBatchResponse(BaseModel):
    values: dict[str, str]
    language: str


@router.post("/", response_model=TransliterateResponse)
async def transliterate_text(body: TransliterateRequest):
    itc = LANGUAGE_TO_ITC.get(body.language)
    if not itc:
        return TransliterateResponse(
            original=body.text, transliterated=body.text, language=body.language
        )

    result = await _google_transliterate(body.text, itc)
    return TransliterateResponse(
        original=body.text, transliterated=result, language=body.language
    )


@router.post("/batch", response_model=TransliterateBatchResponse)
async def transliterate_batch(body: TransliterateBatchRequest):
    itc = LANGUAGE_TO_ITC.get(body.language)
    if not itc:
        return TransliterateBatchResponse(values=body.values, language=body.language)

    result = {}
    for key, text in body.values.items():
        if text.strip():
            result[key] = await _google_transliterate(text, itc)
        else:
            result[key] = text

    return TransliterateBatchResponse(values=result, language=body.language)
