# Deploying to production

CI/CD is a manually-triggered GitHub Actions workflow
(`.github/workflows/deploy.yml`, Actions tab → "Build and deploy" → Run
workflow). It never runs automatically on push — the app is under heavy
active development, so deploys stay a deliberate action until things
settle down. To make it automatic later, add a `push: branches: [main]`
trigger alongside `workflow_dispatch`.

It builds two images (backend, frontend) from their `Dockerfile.prod`
files, pushes them to GHCR, then SSHes into your server, pulls the new
images, runs Alembic migrations, and restarts the stack with
`docker-compose.prod.yml`. Rendering runs on a local worker (not this
server) — see the note at the top of `docker-compose.prod.yml`.

None of this touches the existing `docker-compose.yml` / `Dockerfile`s
used for local dev — production has its own `Dockerfile.prod` files and
`docker-compose.prod.yml`.

## One-time setup

### 1. GitHub Secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SSH_HOST` | Your server's IP or hostname |
| `SSH_USER` | SSH user with Docker access (e.g. `deploy`) |
| `SSH_KEY` | Private key for that user (the matching public key must be in the server's `~/.ssh/authorized_keys`) |
| `SSH_PORT` | Optional, defaults to `22` |
| `DEPLOY_PATH` | Optional, defaults to `/opt/invitation-video` |

`GITHUB_TOKEN` (for pushing to GHCR) is provided automatically — nothing
to add for that.

Repo → Settings → Secrets and variables → Actions → **Variables** tab (not
Secrets — these aren't sensitive, they're `VITE_*` build args baked into
the static frontend bundle at build time, so they end up in the shipped
JS either way):

| Variable | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | The Google OAuth client ID (from Cloud Console → Credentials) |
| `VITE_API_URL` | Optional — only if the frontend needs to hit a separate API domain; leave unset to auto-infer from the browser's host |

These only take effect on the *next* deploy run — the frontend image
already built won't pick them up retroactively, since `vite build` bakes
`VITE_*` vars in at CI build time, not at container runtime. The
server's `.env` has no effect on these; it's read by the backend
container at runtime, never by the CI build step.

### 2. Make the GHCR packages public (recommended)

By default GHCR packages inherit the repo's visibility and can end up
private, which means the *server* also needs to authenticate to pull
images (extra setup, and private packages have a 500MB storage / 1GB
transfer per month free-tier cap). Simplest path: after the first deploy
run creates the three packages, go to each one
(`github.com/<you>?tab=packages`) → Package settings → Change visibility
→ Public. Public GHCR packages are unlimited and free, and the server
needs no registry login at all.

If you'd rather keep them private, `docker login ghcr.io` on the server
once with a GitHub PAT that has `read:packages` scope.

### 3. Prepare the server

```bash
# Install Docker + Compose plugin (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh

mkdir -p /opt/invitation-video
cd /opt/invitation-video
```

Create `.env` here by hand (never committed, never touched by CI) — same
shape as local dev's `.env` but with real production values. At minimum,
different from your local `.env`:

```bash
# Point at the images the workflow pushes — must match your GitHub
# owner/repo, lowercased, e.g.:
GHCR_NAMESPACE=ghcr.io/youruser/invitation-video

# Your real domain — Caddy issues/renews the HTTPS cert for this
# automatically, no other TLS config needed.
DOMAIN=yourdomain.com

# Generate with: openssl rand -hex 32 — the default is a placeholder and
# must not be used in production.
JWT_SECRET_KEY=<generate a real one>

DEBUG=false
BACKEND_CORS_ORIGINS=https://yourdomain.com

# Real (non-placeholder) values for everything else already in your local
# .env: POSTGRES_*, RAZORPAY_* (live keys), TWILIO_*, etc.

# Storage is R2 (S3-compatible), not MinIO, in production:
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY=<r2 access key id>
S3_SECRET_KEY=<r2 secret access key>
S3_BUCKET_NAME=<r2 bucket name>
S3_REGION=auto
CDN_BASE_URL=https://<r2 public dev URL or custom domain>
```

Then bring the stack up for the first time:

```bash
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env run --rm backend alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

After that, every deploy is just the GitHub Actions button.

## What's different from local dev

- Backend/worker run without `--reload`, no source bind-mounts — the
  image is self-contained.
- Frontend is a static build served by nginx (`frontend/Dockerfile.prod`),
  not the Vite dev server.
- Renderer bakes the frontend's Remotion source into the image at build
  time instead of the dev-only volume mount.
- Postgres/redis/minio are not published to the host at all — only Caddy
  (80/443) is reachable from outside. Everything else talks over the
  internal Docker network.
- Caddy fronts everything with automatic HTTPS (Let's Encrypt) and
  reverse-proxies `/api/*` to the backend, everything else to the
  frontend.

## Rollback

Images are tagged `:latest` only right now, so a bad deploy needs a fix
forward (revert the commit, re-run the workflow) rather than a one-click
rollback. If you want tagged rollbacks later, tag pushes with the commit
SHA in the workflow (`docker/build-push-action`'s `tags:` input) and keep
a `docker compose -f docker-compose.prod.yml up -d` command that pins a
specific SHA tag instead of `latest`.

## Production-readiness notes (from the pre-deploy audit)

These are real gaps found while setting this up — none block a first
deploy, but worth knowing:

- **`JWT_SECRET_KEY` default is a placeholder** (`change-me-in-production`)
  — the app will run fine with it, which is exactly the danger; make sure
  your production `.env` overrides it with a real random value.
- **No rate limiting beyond OTP requests** — `/api/auth/send-otp` has its
  own rate limit (`OTP_RATE_LIMIT_MAX`), but other endpoints don't. Low
  risk at current scale, worth adding (e.g. `slowapi`) before real public
  traffic.
- **MinIO root credentials default to `minioadmin`/`minioadmin123`** —
  override both in production `.env`, same reasoning as the JWT secret.
- **No image tag pinning** — see Rollback above.
- **Twilio is still on a trial account** — WhatsApp notifications need an
  approved Content Template (`TWILIO_CONTENT_SID`) and the account taken
  off trial before they'll actually deliver to real customer numbers; SMS
  OTP is on a trial-account workaround (see `sms_service.py`) that
  generates its own fixed demo code today and will need a real dynamic
  message once you're off trial. Both already documented in-code.
