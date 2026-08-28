# Bring My Matter — invitation video builder

Customers pick a video invitation template, fill their own names/dates into it
in a browser editor, pay, and get back a rendered MP4 (plus an optional PDF
card). Admins author the templates in-app by placing animated text/image blocks
over an uploaded source video.

Stack: FastAPI + Celery + Remotion (Node renderer sidecar) + React/Vite +
Postgres + Redis + MinIO (Cloudflare R2 in production). Everything runs in
Docker Compose.

---

## Prerequisites

- Docker + the Compose plugin (`docker compose version` should work)
- `make`
- ~8 GB free RAM — the renderer container runs headless Chromium and is capped
  at 6 GB with a 4 GB `/dev/shm`

Node and Python are **not** needed on the host for normal development; both run
inside containers with the source bind-mounted. Install Node locally only if you
want to run `tsc`/`vite build` outside Docker.

## First-time setup

```bash
git clone <this repo> && cd invitation-video

# 1. Create your .env from the template
cp .env.example .env

# 2. Start everything (first run builds images — several minutes)
make up

# 3. Create the database schema
make migrate

# 4. Seed starter categories + Noto fonts (downloads from Google Fonts)
make seed
```

`make seed` creates categories, ~25 Google fonts, and one sample "Royal Wedding"
template — but that template has **no source video** (`video_key` is null), so
nothing can be rendered from it yet. Upload a video to it from `/admin` before
trying a render end to end.

Then open:

| URL | What |
|---|---|
| http://localhost:5173 | Customer site |
| http://localhost:5173/admin | Admin console |
| http://localhost:8000/docs | FastAPI interactive API docs |
| http://localhost:9001 | MinIO console (`minioadmin` / `minioadmin123`) |

### Make yourself an admin

Accounts are only ever created by Google Sign-In (`POST /api/auth/google`) —
there is no signup form, and email+password is a *second* credential an existing
user adds afterwards via `/api/auth/set-password`. So configure the Google OAuth
variables below before your first login.

There is no admin bootstrap script. Log in once through the site, then flip the
flag on your own user:

```bash
docker compose exec postgres psql -U invitation -d invitation_video \
  -c "UPDATE users SET is_admin = true WHERE email = 'you@example.com';"
```

Log out and back in, then `/admin` unlocks.

## Configuration

`.env` is read by the backend, worker, and frontend containers. `.env.example`
is the full annotated list; the defaults work out of the box for local
development. What actually matters:

**Works as-is locally** — `DATABASE_URL`, `REDIS_URL`, and the `S3_*` /
`MINIO_*` block already point at the compose services. Leave them alone unless
you're pointing at something else.

**Set before those features work:**

| Variable | Needed for |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VITE_GOOGLE_CLIENT_ID` | **Any login at all** — this is the only way a user account gets created. Add `http://localhost:5173/login-callback` as an Authorized redirect URI on the OAuth client. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Checkout. Test keys are fine locally. |
| `META_TOKEN`, `META_PHONE_NUMBER_ID` | WhatsApp notifications (see [below](#whatsapp-notifications)). Optional — everything else works without it; unset just logs what would have been sent. |
| `JWT_SECRET_KEY` | Must be replaced with `openssl rand -hex 32` for any real deployment. |
| `APP_BASE_URL` | The site's own public URL. Used to build the `/watch/{job_id}` link a customer gets when their video is ready. Defaults to `http://localhost:5173`. |

**Behaviour switches:**

- `SERVER_RENDERING` (default `true`) — when `false`, paid orders are not
  rendered on this host. They queue in Redis and wait for a worker to connect
  (see [Manual render queue](#manual-render-queue)), and show up in the admin
  "Renders Awaiting" page.
- `VITE_API_URL` — leave unset. The frontend infers the API host from whatever
  hostname the browser used, so opening the dev server from a phone on the same
  WiFi (`http://192.168.x.x:5173`) just works.
- `RENDER_CONCURRENCY` / `MAX_PARALLEL_JOBS` — renderer frame concurrency and
  simultaneous render jobs.
- `PROD_*` — optional; only for the manual-render workflow below.
  `PROD_APP_BASE_URL` is the one to remember: when you complete a *production*
  job from a local admin session, it is what keeps the customer's link pointing
  at the live site instead of your localhost. Unset falls back to `APP_BASE_URL`.

Google Sign-In creates the account; email+password is an optional extra
credential a logged-in user sets afterwards. There is no SMS/OTP login.

### WhatsApp notifications

Sent through the Meta WhatsApp Cloud API using **pre-approved message
templates** — Meta does not allow arbitrary text to a customer who has not
messaged you first. Two templates are wired up, each with two body variables
(`{{1}}` first name, `{{2}}` order number, e.g. `INV-000123`):

| Template | Fires when | Sent by |
|---|---|---|
| `ordered` | Razorpay payment verified | backend, `api/payments.py` |
| `delivery_confirmation` | a render job reaches `completed` | the Celery worker (`workers/tasks.py`), or the backend when an admin uploads a hand-rendered file from `/admin/renders` |

Override the names/languages with `META_WHATSAPP_TEMPLATE_NAME` /
`META_WHATSAPP_TEMPLATE_LANG` and `META_WHATSAPP_DELIVERY_TEMPLATE_NAME` /
`META_WHATSAPP_DELIVERY_TEMPLATE_LANG` if your approved templates are named or
localised differently. The language code must match what Meta approved, or the
send fails with `132001`.

The gotcha: `delivery_confirmation` is sent by **whichever process finished the
render**. With `SERVER_RENDERING=false` that is usually the local-worker stack,
so `META_TOKEN` and `META_PHONE_NUMBER_ID` have to be in
`.env.production-worker` as well — setting them only on the server means
manual-queue renders complete silently.

Sending is best-effort by design: `services/whatsapp_service.py` never raises,
so a failed notification can never fail a payment or re-queue a finished
render. Failures are logged with Meta's own error body — `132001` template not
found/approved, `132000` parameter count mismatch, `131030` recipient not on
the test-mode allow list.

To check a template end to end without placing an order:

```bash
docker compose exec backend python -c "
from app.services.whatsapp_service import send_render_ready
print(send_render_ready('91XXXXXXXXXX', 'Test User', 'INV-000123'))"
```

`True` means Meta accepted it. Use a recipient that is **not** the WABA's own
sending number — Meta rejects that with a generic `(#100) Invalid parameter`
that looks like a template problem but isn't.

## Daily commands

```bash
make up                 # start the dev stack
make down               # stop it
make logs               # follow everything (also: logs-backend, logs-worker)
make restart-backend    # restart backend + worker
make shell-backend      # bash inside the backend container
make ps                 # container status
make clean              # down -v — wipes the database and MinIO volumes
```

Backend and frontend both hot-reload from bind-mounted source; you rarely need
`make build`. Rebuild when Python or npm dependencies change.

The worker runs `worker_concurrency=1`, so renders are strictly serial — a job
sitting at `pending` usually means an earlier render is still holding the single
slot, not that anything is broken. `make logs-worker` shows what it is chewing
on. Because tasks live in Redis and are acked late, a queued render also
survives `make down`, and the worker will pick it up again on the next `make up`.

### Database migrations

```bash
make migration msg="add whatever"   # autogenerate a revision
make migrate                        # apply to head
```

Revisions are hand-numbered (`001` … `033`) with an explicit `down_revision`
chain — set `revision`/`down_revision` by hand on any new file, continuing the
sequence.

### Adding fonts in bulk

```bash
# Google Fonts, inside the container
docker compose exec backend python -m scripts.bulk_add_fonts

# Your own font files dropped into font-library-import/, from the host
python3 scripts/import_local_fonts.py            # dry run
python3 scripts/import_local_fonts.py --commit
```

### Sharing a local demo

`./scripts/demo-cloudflare.sh` (no account needed) or `./scripts/demo-ngrok.sh`
puts the running stack behind a public HTTPS tunnel and reverts the frontend to
normal mode on exit. Neither touches `.env`.

## Manual render queue

Rendering is heavy, so production can run without a renderer: set
`SERVER_RENDERING=false` there and paid orders simply queue in Redis.

`docker-compose.local-worker.yml` runs a backend + worker + renderer on your own
machine wired to **production** Postgres/Redis (over Tailscale) and R2:

```bash
cp .env.production-worker.example .env.production-worker   # fill in real values
make up-worker      # backend :8001, frontend :5174, renderer :3100
make logs-worker-stack
make down-worker
```

`.env.production-worker` needs its own `META_TOKEN` / `META_PHONE_NUMBER_ID` —
this stack is what finishes the render, so it is what sends the customer's
"your video is ready" message. Compose reads `env_file` at container *create*
time, so after editing it use `make up-worker` with `--force-recreate` (or
`make down-worker` first) or the running containers keep the old values.

It drains the queue oldest-first as soon as it connects, no admin click needed,
and several machines can run it at once. It uses its own Compose project name
(`prod-worker`), so it coexists with the normal dev stack instead of replacing
it — but note the two admin panels look at different databases: `:5173/admin` is
local data, `:5174/admin` is production.

## Deploying

Production is a separate stack (`docker-compose.prod.yml` + `ops/Caddyfile`,
automatic HTTPS via Caddy, R2 for storage) shipped by a manually-triggered
GitHub Actions run. Full setup — server prep, secrets, GHCR — is in
[DEPLOY.md](DEPLOY.md).

## Where things live

```
backend/app/api/         FastAPI routers (all /api/* except sitemap + seo_render)
backend/app/models/      SQLAlchemy models — Template, TextBlock, RenderJob, ...
backend/app/workers/     Celery tasks, the ffmpeg fallback renderer, PDF generator
backend/alembic/         Migrations
frontend/src/pages/      Customer pages + admin console
frontend/src/remotion/   The Remotion composition — used by BOTH the browser
                         preview and the server render
renderer/server.js       Express sidecar wrapping @remotion/bundler + renderer
ops/Caddyfile            Production reverse proxy / TLS / bot routing
```

`CLAUDE.md` has the architecture notes worth reading before changing the render
pipeline.
