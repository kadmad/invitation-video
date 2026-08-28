import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import admin, auth, categories, drafts, fonts, payments, templates, renders, seo_render, sitemap, transliterate

# Without this, module loggers propagate to a bare root logger that has no
# handler and a WARNING threshold, so anything logged at INFO by app code
# (e.g. "[WhatsApp] Meta not configured...") silently disappears in the API
# process. Uvicorn configures only its own loggers, not ours.
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS.split(","),
    # Also allow any device on a private LAN (phone on the same WiFi hitting the
    # dev machine's LAN IP) without needing that IP hardcoded — it changes
    # between networks/DHCP renewals. Dev-only convenience; the explicit
    # allowlist above still governs any real deployment.
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$",
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
app.include_router(sitemap.router, tags=["sitemap"])  # no /api prefix — served at the site root
# No /api prefix — Caddy proxies only bot User-Agents to this path here (see
# ops/Caddyfile); real browsers get the SPA's /editor/{slug} from the
# frontend container, never this route.
app.include_router(seo_render.router, tags=["seo"])


@app.get("/health")
async def health():
    return {"status": "ok"}
