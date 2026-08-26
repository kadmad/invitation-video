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
| `META_TOKEN`, `META_PHONE_NUMBER_ID` | WhatsApp order/render notifications. Optional — everything else works without it. |
| `JWT_SECRET_KEY` | Must be replaced with `openssl rand -hex 32` for any real deployment. |

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

Google Sign-In creates the account; email+password is an optional extra
credential a logged-in user sets afterwards. There is no SMS/OTP login.

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
