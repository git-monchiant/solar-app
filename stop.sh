#!/usr/bin/env bash
# Stop Solar App dev + ngrok started by start.sh.

set -eu

PORT="${PORT:-3010}"
NGROK_DOMAIN="senasolar.ngrok.app"

# supervisor ต้องตายก่อน ไม่งั้นมันปลุก dev กลับมาใน 2 วิ
echo "▶ kill dev supervisor"
if PIDS=$(pgrep -f "solar-dev-supervisor" 2>/dev/null); then
  kill ${PIDS} 2>/dev/null && echo "  killed ${PIDS}"
else
  echo "  no supervisor running"
fi

echo "▶ kill dev on :${PORT}"
if PID=$(lsof -ti ":${PORT}" 2>/dev/null); then
  kill ${PID} && echo "  killed ${PID}"
else
  echo "  nothing on :${PORT}"
fi

echo "▶ kill ngrok ${NGROK_DOMAIN}"
if PIDS=$(pgrep -f "ngrok.*${NGROK_DOMAIN}" 2>/dev/null); then
  kill ${PIDS} && echo "  killed ${PIDS}"
else
  echo "  no ngrok for ${NGROK_DOMAIN}"
fi
