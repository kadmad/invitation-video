from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.models.template import Template

router = APIRouter()

# Static marketing pages, in priority order. changefreq/priority are
# per-URL knobs Google treats as hints, not guarantees, but cost nothing to
# set sensibly.
_STATIC_PAGES = [
    ("/", "weekly", "1.0"),
    ("/templates", "weekly", "0.9"),
    ("/terms", "yearly", "0.3"),
    ("/privacy", "yearly", "0.3"),
    ("/refund", "yearly", "0.3"),
]


def _url_entry(loc: str, lastmod: str | None, changefreq: str, priority: str) -> str:
    lastmod_tag = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
    return (
        "<url>"
        f"<loc>{loc}</loc>"
        f"{lastmod_tag}"
        f"<changefreq>{changefreq}</changefreq>"
        f"<priority>{priority}</priority>"
        "</url>"
    )


@router.get("/sitemap.xml")
async def sitemap(db: AsyncSession = Depends(get_db)):
    """Dynamically generated — every published template gets its own
    /editor/{slug} entry (that's the real, indexable per-template page;
    /templates itself is a client-rendered browse grid) so new templates
    show up for search engines the moment they're published, with no
    manual sitemap edits ever needed again."""
    base = settings.APP_BASE_URL.rstrip("/")
    today = date.today().isoformat()

    entries = [
        _url_entry(f"{base}{path}", today, changefreq, priority)
        for path, changefreq, priority in _STATIC_PAGES
    ]

    result = await db.execute(
        select(Template.slug, Template.updated_at)
        .where(Template.is_published == True)  # noqa: E712
        .order_by(Template.updated_at.desc())
    )
    for slug, updated_at in result.all():
        entries.append(
            _url_entry(f"{base}/editor/{slug}", updated_at.date().isoformat(), "weekly", "0.8")
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries)
        + "\n</urlset>\n"
    )
    return Response(content=xml, media_type="application/xml")
