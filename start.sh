#!/usr/bin/env bash
# Solar App dev launcher — starts Next.js dev on port 3010 and ngrok tunnel
# to senasolar.ngrok.app. Idempotent: skips whatever's already running.
#
# Logs:
#   .next/dev/logs/next-development.log      (managed by Next.js itself)
#   /tmp/solar-ngrok.log                     (this script)
#
# Stop with:  ./stop.sh   (or kill the PIDs printed below)

set -eu

PORT=3010
NGROK_DOMAIN="senasolar.ngrok.app"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NGROK_LOG="/tmp/solar-ngrok.log"

cd "${PROJECT_DIR}"

# ── Next.js dev ───────────────────────────────────────────────────────────
echo "▶ Next.js dev (port ${PORT})"
if lsof -ti ":${PORT}" >/dev/null 2>&1; then
  PID=$(lsof -ti ":${PORT}")
  echo "  already running (PID ${PID}) — skip"
else
  # Detach so the script can exit cleanly; logs land in Next's own log file.
  nohup npm run dev -- --port "${PORT}" </dev/null >/dev/null 2>&1 &
  DEV_PID=$!
  echo "  started (PID ${DEV_PID})"
  # Wait until the port actually answers so the next step can hit it.
  for _ in $(seq 1 30); do
    if lsof -ti ":${PORT}" >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
fi

# ── ngrok ─────────────────────────────────────────────────────────────────
echo "▶ ngrok ${NGROK_DOMAIN} → ${PORT}"
if pgrep -f "ngrok.*${NGROK_DOMAIN}" >/dev/null 2>&1; then
  PID=$(pgrep -f "ngrok.*${NGROK_DOMAIN}" | head -1)
  echo "  already running (PID ${PID}) — skip"
else
  nohup ngrok http --url="${NGROK_DOMAIN}" "${PORT}" --log=stdout </dev/null >"${NGROK_LOG}" 2>&1 &
  NGROK_PID=$!
  echo "  started (PID ${NGROK_PID}) — log: ${NGROK_LOG}"
fi

echo
echo "✅ Local:   http://localhost:${PORT}"
echo "✅ Public:  https://${NGROK_DOMAIN}"
