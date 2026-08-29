"""Populate the funnel dashboard with realistic demo traffic.

Development only. Every row it writes carries an anon_id prefixed `seed-`,
which is the whole cleanup story: `--clear` deletes exactly those and leaves
real visitor data untouched.

The point is not random noise — it's a funnel shaped like a real one, so the
dashboard can be judged on whether it makes the shape legible. Each template
gets its own conversion profile, because the question the dashboard exists to
answer ("which template deserves ad spend") only has an answer if templates
differ from each other.

    docker compose exec backend python -m app.seed_analytics
    docker compose exec backend python -m app.seed_analytics --clear
"""
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.analytics_event import AnalyticsEvent
from app.models.template import Template

# Same sync-engine pattern as app.seed — this is a one-shot script, not part
# of the request path, so there's no reason to drag in the async stack.
sync_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("postgresql+asyncpg", "postgresql")
SessionLocal = sessionmaker(create_engine(sync_url))

SEED_PREFIX = "seed-"
DAYS = 30

# Conversion profile per template slot, applied in order to whatever templates
# exist. Each is a plausible, *different* story the dashboard should be able to
# tell at a glance.
PROFILES = [
    # A strong performer: people watch it and they buy it.
    {"name": "strong", "traffic": 1.0, "watch": 0.62, "edit": 0.55, "fill": 0.70, "checkout": 0.62, "pay": 0.75},
    # The trap the dashboard exists to catch: lots of attention, almost no
    # sales. Great advert, weak product (or wrong price).
    {"name": "looker", "traffic": 1.4, "watch": 0.71, "edit": 0.42, "fill": 0.35, "checkout": 0.18, "pay": 0.40},
    # Barely seen, but everyone who does see it converts. Deserves more spend.
    {"name": "hidden_gem", "traffic": 0.25, "watch": 0.68, "edit": 0.70, "fill": 0.80, "checkout": 0.72, "pay": 0.85},
    # Ordinary.
    {"name": "average", "traffic": 0.7, "watch": 0.45, "edit": 0.40, "fill": 0.50, "checkout": 0.45, "pay": 0.65},
]

BASE_VISITORS_PER_DAY = 22


def _clear(db) -> int:
    result = db.execute(
        delete(AnalyticsEvent).where(AnalyticsEvent.anon_id.like(f"{SEED_PREFIX}%"))
    )
    db.commit()
    return result.rowcount or 0


def _add(db, event, when, anon, session, template_id=None, value=None, meta=None):
    db.add(
        AnalyticsEvent(
            id=uuid.uuid4(),
            event=event,
            template_id=template_id,
            user_id=None,
            anon_id=anon,
            session_id=session,
            value=value,
            meta=meta,
            # created_at has a server default, so it must be set explicitly to
            # backdate a row — otherwise every event lands "now" and the time
            # filters all show the same thing.
            created_at=when,
        )
    )


def main() -> None:
    clear_only = "--clear" in sys.argv

    with SessionLocal() as db:
        removed = _clear(db)
        print(f"cleared {removed} seeded events")
        if clear_only:
            return

        templates = db.execute(select(Template).order_by(Template.created_at)).scalars().all()
        if not templates:
            print("no templates in the database — nothing to attribute traffic to")
            return

        rng = random.Random(20260829)  # stable output across runs
        now = datetime.now(timezone.utc)
        written = 0

        for day in range(DAYS):
            day_start = now - timedelta(days=day)
            # Weekends run hotter — invitations get shopped for on days off, and
            # a flat line would make the chart look synthetic.
            weekend = day_start.weekday() >= 5
            visitors = int(BASE_VISITORS_PER_DAY * (1.5 if weekend else 1.0) * rng.uniform(0.7, 1.3))

            for v in range(visitors):
                anon = f"{SEED_PREFIX}{day}-{v}-{rng.randrange(10**6)}"
                session = f"{SEED_PREFIX}s{day}-{v}"
                when = day_start - timedelta(
                    hours=rng.randrange(0, 24), minutes=rng.randrange(0, 60)
                )

                # Roughly a fifth arrive straight on a shared /editor link and
                # never see the landing page — the real traffic mix here, and
                # the reason the funnel's percentages anchor on the widest
                # stage rather than the first.
                direct = rng.random() < 0.2
                if not direct:
                    _add(db, "landing_view", when, anon, session)
                    written += 1
                    if rng.random() > 0.72:
                        continue  # bounced off the landing page
                    _add(db, "browse_view", when + timedelta(seconds=20), anon, session)
                    written += 1
                    if rng.random() > 0.75:
                        continue  # browsed, nothing caught their eye

                # Pick a template, weighted by its traffic profile.
                weights = [PROFILES[i % len(PROFILES)]["traffic"] for i in range(len(templates))]
                tmpl = rng.choices(templates, weights=weights, k=1)[0]
                p = PROFILES[templates.index(tmpl) % len(PROFILES)]
                t0 = when + timedelta(seconds=45)

                if not direct:
                    _add(db, "template_card_click", t0, anon, session, tmpl.id, meta={"slug": tmpl.slug})
                    written += 1

                _add(db, "preview_play", t0 + timedelta(seconds=5), anon, session, tmpl.id,
                     meta={"surface": "browse_card" if not direct else "editor"})
                written += 1

                if rng.random() > p["watch"]:
                    continue  # clicked play, wandered off before 10s
                _add(db, "preview_10s", t0 + timedelta(seconds=16), anon, session, tmpl.id, value=10,
                     meta={"surface": "browse_card" if not direct else "editor"})
                written += 1
                if rng.random() < 0.35:
                    _add(db, "preview_complete", t0 + timedelta(seconds=40), anon, session, tmpl.id)
                    written += 1

                if rng.random() > p["edit"]:
                    continue  # watched it, didn't open the editor
                _add(db, "editor_open", t0 + timedelta(minutes=1), anon, session, tmpl.id)
                written += 1

                if rng.random() > 0.82:
                    continue  # opened the editor, never typed anything
                _add(db, "customization_started", t0 + timedelta(minutes=2), anon, session, tmpl.id, value=1)
                written += 1

                if rng.random() < 0.22:
                    _add(db, "image_uploaded", t0 + timedelta(minutes=3), anon, session, tmpl.id)
                    written += 1
                if rng.random() < 0.12:
                    _add(db, "music_uploaded", t0 + timedelta(minutes=4), anon, session, tmpl.id, value=95.0)
                    written += 1
                if rng.random() < 0.18:
                    _add(db, "advanced_mode_opened", t0 + timedelta(minutes=4), anon, session, tmpl.id)
                    written += 1
                if rng.random() < 0.15:
                    _add(db, "share_link_copied", t0 + timedelta(minutes=5), anon, session, tmpl.id)
                    written += 1

                if rng.random() > p["fill"]:
                    continue  # started typing, gave up part-way
                _add(db, "customization_complete", t0 + timedelta(minutes=6), anon, session, tmpl.id, value=6)
                written += 1

                # Everyone hits the login wall on the way to checkout; a slice
                # of them stop there and never come back. That group is the
                # dashboard's "Stopped at the login wall" card.
                _add(db, "auth_wall_hit", t0 + timedelta(minutes=7), anon, session, tmpl.id)
                written += 1
                if rng.random() < 0.28:
                    continue

                if rng.random() > p["checkout"]:
                    continue  # filled everything in, never opened checkout
                _add(db, "checkout_opened", t0 + timedelta(minutes=8), anon, session, tmpl.id)
                written += 1

                if rng.random() < 0.30:
                    _add(db, "watermark_opted_in", t0 + timedelta(minutes=8, seconds=20), anon, session, tmpl.id)
                    written += 1

            db.commit()

        print(f"wrote {written} seeded events across {DAYS} days and {len(templates)} templates")
        print("clean up with: python -m app.seed_analytics --clear")


if __name__ == "__main__":
    main()
