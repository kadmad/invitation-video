#!/usr/bin/env bash
# Same as demo-ngrok.sh, but via Cloudflare's free Quick Tunnel — no account,
# no login, no bandwidth cap. Does NOT touch .env or any committed config;
# proxy mode is enabled purely via a shell-exported env var passed to the
# frontend container, and is reverted automatically when this script exits.
#
# Requires: cloudflared (brew install cloudflared).
#
# Usage: ./scripts/demo-cloudflare.sh

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install it: brew install cloudflared" >&2
  exit 1
fi

LOGFILE="$(mktemp)"

cleanup() {
  echo
  echo "Stopping demo — reverting frontend to normal (direct-backend) mode..."
  docker compose up -d --force-recreate frontend >/dev/null
  rm -f "$LOGFILE"
  echo "Done. Back to normal local/LAN mode."
}
trap cleanup EXIT INT TERM

echo "Starting backend/worker/storage (if not already up)..."
docker compose up -d postgres redis minio minio-init backend worker >/dev/null

echo "Switching frontend into single-tunnel proxy mode..."
VITE_API_URL=/api docker compose up -d --force-recreate frontend >/dev/null

echo "Waiting for frontend to come up..."
for i in $(seq 1 30); do
  curl -sf http://localhost:5173 >/dev/null && break
  sleep 1
done

echo
echo "Frontend ready. Starting Cloudflare quick tunnel on :5173..."
cloudflared tunnel --url http://localhost:5173 --no-autoupdate > "$LOGFILE" 2>&1 &
CF_PID=$!

echo "Waiting for tunnel URL..."
URL=""
for i in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$LOGFILE" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Could not detect tunnel URL — check the log:" >&2
  cat "$LOGFILE" >&2
  kill "$CF_PID" 2>/dev/null || true
  exit 1
fi

echo
echo "=================================================="
echo "Share this link:  $URL"
echo "=================================================="
echo "Press Ctrl+C here when the demo is done — it will revert everything automatically."
echo

wait "$CF_PID"
