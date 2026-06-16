#!/usr/bin/env bash
# Stop Solar App dev + ngrok started by start.sh.

set -eu

PORT=3010
NGROK_DOMAIN="senasolar.ngrok.app"

echo "▶ kill dev on :${PORT}"
if PID=$(lsof -ti ":${PORT}" 2>/dev/null); then
  kill "${PID}" && echo "  killed ${PID}"
else
  echo "  nothing on :${PORT}"
fi

echo "▶ kill ngrok ${NGROK_DOMAIN}"
if PIDS=$(pgrep -f "ngrok.*${NGROK_DOMAIN}" 2>/dev/null); then
  kill ${PIDS} && echo "  killed ${PIDS}"
else
  echo "  no ngrok for ${NGROK_DOMAIN}"
fi
