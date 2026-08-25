import json
import uuid
from html import escape

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import get_db
from app.models.render_job import RenderJob
from app.models.template import Template

router = APIRouter()

SITE_NAME = settings.APP_NAME


def _base_url() -> str:
    return settings.APP_BASE_URL.rstrip("/")


def _page(
    *,
    title: str,
    description: str,
    canonical: str,
    image: str,
    image_alt: str,
    body: str,
    noindex: bool = False,
    json_ld: dict | None = None,
) -> str:
    """Minimal static HTML shell with correct per-page <head> tags.

    Only reached by crawlers/link-preview bots (Caddy routes them here for
    /editor/*; real browsers always get the SPA) — so this doesn't need to
    match the app's visual design, just the metadata and enough visible
    content to be a legitimate, indexable page rather than an empty shell.
    """
    robots = "noindex, nofollow" if noindex else "index, follow, max-image-preview:large"
    ld_script = (
        f'<script type="application/ld+json">{json.dumps(json_ld)}</script>' if json_ld else ""
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{escape(title)}</title>
<meta name="description" content="{escape(description)}" />
<meta name="robots" content="{robots}" />
<link rel="canonical" href="{escape(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="{escape(SITE_NAME)}" />
<meta property="og:title" content="{escape(title)}" />
<meta property="og:description" content="{escape(description)}" />
<meta property="og:url" content="{escape(canonical)}" />
<meta property="og:image" content="{escape(image)}" />
<meta property="og:image:alt" content="{escape(image_alt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{escape(title)}" />
<meta name="twitter:description" content="{escape(description)}" />
<meta name="twitter:image" content="{escape(image)}" />
{ld_script}
</head>
<body>
{body}
</body>
</html>"""


@router.get("/editor/{slug}", response_class=HTMLResponse)
async def render_editor_page_for_bots(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Server-rendered stand-in for /editor/{slug}, for crawlers/social-link
    bots only (WhatsApp, Facebook, Twitter, Slack, Googlebot, ...).

    The real /editor/{slug} route is a client-rendered SPA page: its title,
    canonical and og:image are set by a useEffect in EditorPage.tsx, so they
    only exist after React mounts and the template loads. Link-preview bots
    almost never run JavaScript, so a shared WhatsApp/Facebook link — the
    site's main distribution channel — was always showing the generic
    homepage card instead of the specific template's name/image. Caddy
    routes only bot User-Agents for this path here; everyone else still
    gets the SPA from the frontend container untouched.
    """
    base = _base_url()
    canonical = f"{base}/editor/{slug}"
    is_preview = request.query_params.get("preview") == "1"

    result = await db.execute(
        select(Template).where(Template.slug == slug, Template.is_published == True)  # noqa: E712
    )
    template = result.scalar_one_or_none()

    if template is None:
        body = "<h1>Template not found</h1><p>This invitation template is unavailable.</p>"
        return HTMLResponse(
            _page(
                title=f"Template not found | {SITE_NAME}",
                description="This invitation template is unavailable.",
                canonical=canonical,
                image=f"{base}/logo.png",
                image_alt=SITE_NAME,
                body=body,
                noindex=True,
            ),
            status_code=404,
        )

    title = f"{template.name} — Invitation Video Template | {SITE_NAME}"
    description = template.seo_description or (
        f"Personalise the {template.name} video invitation online — add your names, date and "
        "venue in English, Hindi or Gujarati, then download an HD video and PDF card in minutes."
    )
    image = f"{base}/api/templates/{template.slug}/thumbnail" if template.thumbnail_key else f"{base}/logo.png"
    image_alt = f"{template.name} invitation video template preview"

    json_ld: dict = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": title,
        "description": description,
        "image": image,
        "brand": {"@type": "Brand", "name": SITE_NAME},
        "category": "Video Invitation Template",
    }
    if template.price:
        json_ld["offers"] = {
            "@type": "Offer",
            "price": f"{template.price / 100:.2f}",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock",
            "url": canonical,
        }

    body = (
        f"<h1>{escape(template.name)}</h1>"
        f"<p>{escape(description)}</p>"
        f'<img src="{escape(image)}" alt="{escape(image_alt)}" />'
    )

    return HTMLResponse(
        _page(
            title=title,
            description=description,
            canonical=canonical,
            image=image,
            image_alt=image_alt,
            body=body,
            noindex=is_preview,
            json_ld=json_ld,
        )
    )


@router.get("/watch/{render_id}", response_class=HTMLResponse)
async def render_watch_page_for_bots(render_id: str, db: AsyncSession = Depends(get_db)):
    """Server-rendered stand-in for /watch/{id}, for crawlers/social-link bots
    only — same reasoning as render_editor_page_for_bots above. A customer's
    "Share via WhatsApp" / "Copy Link" now point at /watch/{render_id}
    (RenderStatusPage.tsx); without this, that link unfurled as a bare URL
    with no title or image since the real page is a client-rendered SPA.
    Always noindex — these are private, per-order pages, not content meant to
    be discovered/ranked, just previewed nicely when shared."""
    base = _base_url()
    canonical = f"{base}/watch/{render_id}"
    not_found_body = "<h1>Video not available</h1><p>This invitation video link is unavailable.</p>"

    try:
        parsed_id = uuid.UUID(render_id)
    except ValueError:
        return HTMLResponse(
            _page(
                title=f"Video not found | {SITE_NAME}",
                description="This invitation video link is unavailable.",
                canonical=canonical,
                image=f"{base}/logo.png",
                image_alt=SITE_NAME,
                body=not_found_body,
                noindex=True,
            ),
            status_code=404,
        )

    result = await db.execute(
        select(RenderJob)
        .where(RenderJob.id == parsed_id, RenderJob.status == "completed")
        .options(selectinload(RenderJob.template))
    )
    job = result.scalar_one_or_none()

    if job is None or not job.output_key:
        return HTMLResponse(
            _page(
                title=f"Video not found | {SITE_NAME}",
                description="This invitation video link is unavailable.",
                canonical=canonical,
                image=f"{base}/logo.png",
                image_alt=SITE_NAME,
                body=not_found_body,
                noindex=True,
            ),
            status_code=404,
        )

    template = job.template
    title = f"Watch our Invitation Video | {SITE_NAME}" if not template else f"Watch our {template.name} Invitation | {SITE_NAME}"
    description = "Tap to watch the video invitation."
    image = (
        f"{base}/api/templates/{template.slug}/thumbnail"
        if template and template.thumbnail_key
        else f"{base}/logo.png"
    )
    image_alt = f"{template.name} invitation video" if template else SITE_NAME
    body = f"<h1>{escape(title)}</h1><p>{escape(description)}</p><img src=\"{escape(image)}\" alt=\"{escape(image_alt)}\" />"

    return HTMLResponse(
        _page(
            title=title,
            description=description,
            canonical=canonical,
            image=image,
            image_alt=image_alt,
            body=body,
            noindex=True,
        )
    )
