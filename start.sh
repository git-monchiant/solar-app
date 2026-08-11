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

# port แยกตาม branch เพื่อให้รัน v2 กับ v3 พร้อมกันได้ และดูจาก URL ก็รู้ว่าตัวไหน
#   main → 3010   ·   v3 → 3020   ·   กำหนดเองได้ด้วย PORT=xxxx ./start.sh
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
if [[ -z "${PORT:-}" ]]; then
  case "$BRANCH" in
    v3|v3/*) PORT=3020 ;;
    *)       PORT=3010 ;;
  esac
fi
echo "▶ branch ${BRANCH} → port ${PORT}"
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
# ngrok domain ผูกกับ port เดียวเท่านั้น — ถ้าไม่ใช่ port หลัก (หรือสั่ง SKIP_NGROK=1) ข้ามไป
if [[ "${SKIP_NGROK:-0}" == "1" || "${PORT}" != "3010" ]]; then
  echo "▶ ข้าม ngrok (port ${PORT}) — ใช้ http://localhost:${PORT} ได้เลย"
  exit 0
fi
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
