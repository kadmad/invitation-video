# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Bring My Matter" — customers pick a video invitation template, type their own
names/dates into it in a browser editor, pay (Razorpay), and get a rendered MP4
(plus an optional PDF card). Admins author templates in an in-app editor by
placing text/image blocks over an uploaded source video.

Everything runs in Docker Compose. There is no test suite and no linter config —
`tsc -b` (via `npm run build`) is the only static check.

## Commands

All day-to-day work goes through `make` (thin wrappers over `docker compose`):

```bash
make up                 # dev stack: postgres, redis, minio, backend, worker, frontend, renderer
make logs-backend       # or logs / logs-worker
make migrate            # alembic upgrade head (inside backend container)
make migration msg="…"  # alembic revision --autogenerate
make seed               # python -m app.seed
make restart-backend    # backend + worker
make shell-backend      # bash inside backend
make clean              # down -v, wipes volumes
```

Ports: frontend `5173`, backend `8000`, renderer `3101`→3100, MinIO `9000`/console `9001`.

Frontend typecheck/build (host, from `frontend/`): `npm run build` (`tsc -b && vite build`).

Two secondary stacks:

- `make up-worker` — `docker-compose.local-worker.yml`, Compose project name
  `prod-worker`, on ports 8001/5174/3100. It runs backend+worker+renderer
  against **production** Postgres/Redis (over Tailscale) and R2, to drain the
  manual render queue from a local machine. It coexists with the dev stack;
  the pinned project name is what keeps the two from recreating each other's
  containers.
- `docker-compose.prod.yml` + `ops/Caddyfile` on the server; deploys are a
  manually-triggered GitHub Actions run (`.github/workflows/deploy.yml`).
  See `DEPLOY.md` (stale in one place: SMS/OTP auth no longer exists).

Alembic revisions are hand-numbered `001`…`033` with an explicit
`down_revision` chain — keep new ones sequential and set `revision`/
`down_revision` by hand even when autogenerating.

## Architecture

Five services, one shared data model:

- **backend** — FastAPI, async SQLAlchemy 2.0 + asyncpg. Routers in
  `backend/app/api/`, all under `/api/*` except `sitemap.py` and
  `seo_render.py`, which are served at the site root on purpose (see Caddy
  below). Auth is JWT bearer via `dependencies.get_current_user` /
  `get_admin_user`; login is Google OAuth or email+password.
- **worker** — Celery (`backend/app/workers/`), one task at a time
  (`worker_concurrency=1`), `task_acks_late` + `reject_on_worker_lost` so a
  killed worker's job is requeued. `render_video_task` is written to be
  re-runnable from scratch.
- **renderer** — a small Express sidecar (`renderer/server.js`) wrapping
  `@remotion/bundler` + `@remotion/renderer`. It bundles **the frontend's**
  `src/remotion/index.ts` (bind-mounted in dev, baked into the image in prod)
  and exposes `POST /render`, `GET /progress/:id`, `GET /download/:id`,
  `POST /invalidate`.
- **frontend** — React 18 + Vite + Tailwind + zustand, route-level `React.lazy`
  in `App.tsx`. `/admin/*` is a top-level sibling route, not inside the
  customer layout.
- **postgres / redis / minio** — MinIO stands in for Cloudflare R2 locally.

### The central invariant: one Remotion composition, two consumers

`frontend/src/remotion/compositions/GenericTemplate.tsx` is rendered both by
`@remotion/player` in the browser editor and by the renderer service on the
server. A change to it changes the customer's preview *and* the final MP4.
The composition is prop-driven (`videoUrl`, `textBlocks`, `tagValues`,
`fontUrls`, `blockOverrides`, watermark placement, music…) — the worker builds
exactly the same `inputProps` shape the editor passes to the Player.

`backend/app/workers/ffmpeg_renderer.py` is a **second, independent
implementation** of that same visual output using ffmpeg `drawtext` filters. It
is the fallback when the renderer service fails, and it also backs preview
renders. Any change to text placement, animation, fonts, or the watermark has
to be made in both places or the fallback silently diverges from the preview.

### Template data model

A template is a source video plus blocks (`backend/app/models/`):

- `Template` — `video_key`, `preview_key`, `thumbnail_key`, dimensions/fps,
  price/discount, watermark placement, `pdf_snapshot_timestamps`, SEO fields.
- `TextBlock` / `ImageBlock` — normalized 0–1 `position_x/y`, `max_width`,
  `font_size_ratio` (so everything scales across resolutions), per-block font,
  in/out animation + direction + duration, `start_time`/`end_time`, plus JSONB
  `tag_config`, `format_ranges`, `transliteration_overrides`.
- Block `content` embeds `{tag}` placeholders (`"Welcome {bride_name}"`). The
  customer fills tags; `RenderJob.field_values` carries them. `block_overrides`
  lets a customer replace a whole block's text, and `block_format_overrides`
  its rich-text ranges.

Hindi/Gujarati blocks are transliterated at render time via Google Input Tools
(`tasks._transliterate_sync`), respecting admin-picked per-word overrides.
Because transliteration changes string length, `format_ranges` are remapped
through a char index map (`_transliterate_block_content` → `_remap_format_ranges`).

### Render flow

1. `POST /api/payments/verify` validates the Razorpay signature, creates a
   `RenderJob`, and always `.delay()`s `render_video_task` — even when
   `SERVER_RENDERING=false`.
2. With `SERVER_RENDERING=false` the job is marked `render_method="manual"`,
   no worker runs on the production host, and the task simply sits in Redis
   until an admin's local-worker stack connects and drains it. Admins can also
   fulfil it by hand from `/admin/renders` ("Renders Awaiting").
3. The task downloads video + fonts + music in parallel, transliterates,
   builds `inputProps`, POSTs to the renderer, polls progress (mapped into the
   job's 30–90% band), downloads the MP4, uploads to S3, optionally generates
   the PDF, and notifies over WhatsApp. On renderer failure it falls back to
   `FFmpegRenderer`.
4. `render_preview_task` renders the admin-facing template preview (540p,
   higher CRF — deliberately not near-lossless) with its own ffmpeg fallback.

`PROD_*` settings enable a split-brain mode for the local-worker stack: a second
`StorageService` instance (`prod_storage_service`) and a dispatch-only
`prod_celery_app` let local dev act on production's queue without the whole app
switching databases.

### Storage URLs — pick the right helper

`storage_service` has three URL methods and they are not interchangeable:

- `internal_presigned_url` — Docker-internal hostname; for service-to-service
  fetches (the renderer pulling the source video/fonts).
- `presigned_url(key, public_host=…)` — browser-facing; `public_host` makes it
  work from a phone on the LAN. Returns the CDN URL instead when
  `CDN_BASE_URL` is set.
- `public_url` — stable, cacheable; in production R2 is bucket-scoped at the
  root, locally MinIO is not, so the bucket name is added only in the fallback.

`Template.video_key` must never reach the browser. Public responses expose
`has_video` and clients fetch playback through `/api/templates/{id}/video-token`,
which prefers the reviewed `preview_key` render. `templateVideo.ts`'s
`hasPreview` flag exists because raw source uploads (18 MB+ for a short clip)
must never be autoplayed as a background loop.

### SEO / bot handling

Caddy (`ops/Caddyfile`) routes `/api/*` and `/sitemap.xml` to the backend,
User-Agent-matched bots on `/editor/*` and `/watch/*` to
`backend/app/api/seo_render.py` (server-rendered link-preview cards), and
everything else to the frontend. Link previews are the site's main distribution
channel, so changes to those routes are user-visible. The Vite dev server
mirrors the `/sitemap.xml` proxy so the URL isn't SPA-shelled locally.

### Frontend gotchas worth knowing

- `vite.config.ts` deliberately does **not** force Remotion or react-moveable
  into named `manualChunks`. Doing so previously dragged the whole 136 kB
  editor bundle into the landing page's entry chunk via a shared helper
  module, defeating `React.lazy`. The long comment there is the reason — don't
  "tidy" it away.
- `chunkSizeWarningLimit: 500` is a real regression alarm, not noise.
- Editor state lives in `store/editorStore.ts` (customer) and
  `store/adminTemplateStore.ts` (admin, with zundo undo/redo).
