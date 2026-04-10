#!/bin/bash
# Build then restart without killing ngrok
cd /Users/monchiant/sena-project-root/solar-app
npm run build
# Kill only next server, not ngrok
lsof -ti:3700 -sTCP:LISTEN | xargs kill 2>/dev/null
PORT=3700 npx next start -p 3700 &
echo "Server restarted on port 3700"
