#!/usr/bin/env bash
# Share the app with one person over the internet via a single ngrok tunnel,
# for a quick demo only. Does NOT touch .env or any committed config — the
# proxy mode is enabled purely via a shell-exported env var passed to the
# frontend container, and is reverted automatically when this script exits.
#
# Requires: ngrok (https://ngrok.com/download), already `ngrok config add-authtoken ...`'d.
#
# Usage: ./scripts/demo-ngrok.sh

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not found. Install it: https://ngrok.com/download" >&2
  exit 1
fi

cleanup() {
  echo
  echo "Stopping demo — reverting frontend to normal (direct-backend) mode..."
  docker compose up -d --force-recreate frontend >/dev/null
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
echo "Frontend ready. Starting ngrok tunnel on :5173..."
echo "Share the https://*.ngrok-free.app URL ngrok prints below with your tester."
echo "Press Ctrl+C here when the demo is done — it will revert everything automatically."
echo

ngrok http 5173
