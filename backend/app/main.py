from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import admin, auth, categories, drafts, fonts, payments, templates, renders, transliterate

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(fonts.router, prefix="/api/fonts", tags=["fonts"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["drafts"])
app.include_router(renders.router, prefix="/api/renders", tags=["renders"])
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])
app.include_router(transliterate.router, prefix="/api/transliterate", tags=["transliterate"])


@app.get("/health")
async def health():
    return {"status": "ok"}
