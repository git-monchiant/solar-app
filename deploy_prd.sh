#!/bin/bash
# Deploy Solar App to PRODUCTION (172.22.22.100 → container on 172.22.22.105)
#
# Usage:  ./deploy_prd.sh
# Requires:  sshpass, tar, ssh
#
# Flow:  commit reminder → tar+stream source → docker compose up -d --build → smoke test
#
# WARNING: This deploys to live production at https://solar.senadigital.com.
# Real customers will see the change. The host was originally UAT but has been
# promoted; there is no separate staging environment.
set -euo pipefail

PRD_HOST="172.22.22.100"
PRD_PORT="1822"
PRD_USER="optimus-dev"
PRD_PASS="0pt!musd3V"         # TODO: migrate to ssh key / 1password
PRD_DIR="~/solar-app"
PUBLIC_URL="https://solar.senadigital.com"

cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Solar App → PRODUCTION deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. warn if working tree dirty — don't block, just surface it
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  echo "⚠️  Uncommitted changes — deploying anyway. Consider committing first:"
  git status --short | head -10
  echo ""
fi

# 2. local build check — catches prerender / type / import errors before
# wasting 2 min building inside the prod container. Dev mode (npm run dev) is
# more lenient than `next build`, so issues like missing <Suspense> boundaries
# around useSearchParams() only surface here.
echo "🔧 Local build check ..."
if ! npm run build > /tmp/solar-prd-build.log 2>&1; then
  echo "❌ Local build failed. Aborting deploy. Last 30 lines of /tmp/solar-prd-build.log:"
  tail -30 /tmp/solar-prd-build.log
  exit 1
fi
echo "✅ Local build OK"
echo ""

# 2. stream source tarball to prod (excludes dev artifacts + secrets)
echo "📦 Streaming source to ${PRD_HOST}:${PRD_DIR} ..."
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
sshpass -p "${PRD_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${PRD_PORT}" "${PRD_USER}@${PRD_HOST}" \
  "cd ${PRD_DIR} && tar -xzf - && find . -name '._*' -delete"

# 3. ensure uploads dir is writable by the container (uid 1001 = nextjs user
#    inside the image; host dir must be owned by that uid so bind-mount writes
#    don't EACCES).
sshpass -p "${PRD_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${PRD_PORT}" "${PRD_USER}@${PRD_HOST}" \
  "mkdir -p ${PRD_DIR}/uploads && echo '${PRD_PASS}' | sudo -S chown -R 1001:1001 ${PRD_DIR}/uploads 2>/dev/null || true"

# 4. build + restart container on prod
echo "🔨 Building + restarting container on prod ..."
sshpass -p "${PRD_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${PRD_PORT}" "${PRD_USER}@${PRD_HOST}" \
  "cd ${PRD_DIR} && docker compose up -d --build 2>&1 | tail -5"

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
echo "   ssh -p ${PRD_PORT} ${PRD_USER}@${PRD_HOST} 'docker compose -f ${PRD_DIR}/docker-compose.yml logs app --tail 50'"
exit 1
