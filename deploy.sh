#!/bin/bash
# Build then restart without killing ngrok
cd "$(dirname "$0")"
npx next build
# Kill only next server, not ngrok
lsof -ti:3700 -sTCP:LISTEN | xargs kill 2>/dev/null
PORT=3700 npx next start -p 3700 &
echo "Server restarted on port 3700"

# Start ngrok if not already running
if ! pgrep -f "ngrok http" >/dev/null; then
  nohup ngrok http --url=senasolar.ngrok.app 3700 >/tmp/ngrok.log 2>&1 &
  echo "ngrok started"
  sleep 2
else
  echo "ngrok already running"
fi

# Print public URL
sleep 1
curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json; d=json.load(sys.stdin); print('ngrok URL:', d['tunnels'][0]['public_url']) if d.get('tunnels') else print('no tunnels')" 2>/dev/null
