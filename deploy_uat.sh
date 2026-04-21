#!/bin/bash
# Deploy Solar App to UAT server (172.22.22.100 → container on 172.22.22.105)
#
# Usage:  ./deploy-uat.sh
# Requires:  sshpass, tar, ssh
#
# Flow:  commit reminder → tar+stream source → docker compose up -d --build → smoke test
set -euo pipefail

UAT_HOST="172.22.22.100"
UAT_PORT="1822"
UAT_USER="optimus-dev"
UAT_PASS="0pt!musd3V"         # TODO: migrate to ssh key / 1password
UAT_DIR="~/solar-app"
PUBLIC_URL="https://solar.senadigital.com"

cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Solar App → UAT deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. warn if working tree dirty — don't block, just surface it
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  echo "⚠️  Uncommitted changes — deploying anyway. Consider committing first:"
  git status --short | head -10
  echo ""
fi

# 2. stream source tarball to UAT (excludes dev artifacts + secrets)
echo "📦 Streaming source to ${UAT_HOST}:${UAT_DIR} ..."
tar \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.turbo' \
  --exclude='.git' \
  --exclude='.claude' \
  --exclude='public/uploads/*' \
  --exclude='.env.local' \
  --exclude='.env' \
  --exclude='backup' \
  --exclude='Project Infomation' \
  -czf - . | \
sshpass -p "${UAT_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${UAT_PORT}" "${UAT_USER}@${UAT_HOST}" \
  "cd ${UAT_DIR} && tar -xzf - && find . -name '._*' -delete"

# 3. ensure uploads dir is writable by the container (uid 1001 = nextjs user
#    inside the image; host dir must be owned by that uid so bind-mount writes
#    don't EACCES).
sshpass -p "${UAT_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${UAT_PORT}" "${UAT_USER}@${UAT_HOST}" \
  "mkdir -p ${UAT_DIR}/uploads && echo '${UAT_PASS}' | sudo -S chown -R 1001:1001 ${UAT_DIR}/uploads 2>/dev/null || true"

# 4. build + restart container on UAT
echo "🔨 Building + restarting container on UAT ..."
sshpass -p "${UAT_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${UAT_PORT}" "${UAT_USER}@${UAT_HOST}" \
  "cd ${UAT_DIR} && docker compose up -d --build 2>&1 | tail -5"

# 4. wait for health + smoke test via public URL
echo "🔎 Smoke test ..."
for i in {1..12}; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${PUBLIC_URL}/" || echo "000")
  if [[ "$code" == "200" ]]; then
    echo "✅ ${PUBLIC_URL} → HTTP 200"
    exit 0
  fi
  echo "  waiting... (${i}/12, last code: ${code})"
  sleep 5
done

echo "❌ Smoke test failed after 60s. Inspect container:"
echo "   ssh -p ${UAT_PORT} ${UAT_USER}@${UAT_HOST} 'docker compose -f ${UAT_DIR}/docker-compose.yml logs app --tail 50'"
exit 1
