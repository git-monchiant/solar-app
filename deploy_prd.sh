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

# 1. release gate — prod ต้องมาจาก main ที่ commit แล้วและ sync กับ origin เท่านั้น
#
# เดิมแค่เตือนแล้วไปต่อ ซึ่งอันตรายเมื่อมีหลายคน/หลาย branch: สคริปต์นี้ tar ไฟล์
# จากโฟลเดอร์ที่รัน ไม่ได้ deploy จาก git commit ดังนั้นถ้ารันจาก worktree ของ v3
# หรือรันทั้งที่มีไฟล์แก้ค้าง prod จะได้โค้ดที่ไม่มีใครรู้ว่าคืออะไร
#
# ข้าม gate ได้ด้วย ALLOW_DIRTY=1 (เช่นกรณีฉุกเฉินจริงๆ) — จะถูกบันทึกไว้ใน log
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
RELEASE_BRANCH="${RELEASE_BRANCH:-main}"

gate_fail() {
  echo "❌ $1"
  echo "   ถ้าจำเป็นต้องข้ามจริงๆ: ALLOW_DIRTY=1 ./deploy_prd.sh"
  exit 1
}

if [[ "${ALLOW_DIRTY:-0}" == "1" ]]; then
  echo "⚠️  ข้าม release gate ด้วย ALLOW_DIRTY=1 — branch: ${BRANCH}"
  git status --short | head -10
  echo ""
else
  [[ "$BRANCH" == "$RELEASE_BRANCH" ]] \
    || gate_fail "อยู่ branch '${BRANCH}' — deploy prod ได้จาก '${RELEASE_BRANCH}' เท่านั้น"

  [[ -z "$(git status --porcelain 2>/dev/null)" ]] \
    || { echo "❌ มีไฟล์ที่ยังไม่ commit — commit หรือ stash ก่อน:"; git status --short | head -10; \
         echo "   ถ้าจำเป็นต้องข้ามจริงๆ: ALLOW_DIRTY=1 ./deploy_prd.sh"; exit 1; }

  git fetch origin "$RELEASE_BRANCH" --quiet 2>/dev/null || true
  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse "origin/${RELEASE_BRANCH}" 2>/dev/null || echo "$LOCAL")"
  if [[ "$LOCAL" != "$REMOTE" ]]; then
    BEHIND="$(git rev-list --count "HEAD..origin/${RELEASE_BRANCH}" 2>/dev/null || echo 0)"
    AHEAD="$(git rev-list --count "origin/${RELEASE_BRANCH}..HEAD" 2>/dev/null || echo 0)"
    [[ "$BEHIND" == "0" ]] \
      || gate_fail "ตามหลัง origin/${RELEASE_BRANCH} อยู่ ${BEHIND} commit — git pull ก่อน (กัน deploy ทับงานคนอื่น)"
    echo "⚠️  มี ${AHEAD} commit ที่ยังไม่ push — จะ push ให้หลัง deploy สำเร็จ"
  fi
  echo "✅ Release gate ผ่าน — branch ${BRANCH} @ $(git rev-parse --short HEAD)"
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

# 2. apply pending DB migrations to prod BEFORE the new container starts —
# additive schema changes need to land first so the new code finds its columns
# on boot. deploy_migrations.mjs is a no-op when nothing is pending.
echo "🗄️  Applying pending migrations to prod ..."
if ! node scripts/tools/deploy_migrations.mjs --db=solardb --yes; then
  echo "❌ Migration step failed. Aborting deploy."
  exit 1
fi
echo ""

# 3. stream source tarball to prod (excludes dev artifacts + secrets)
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
  --exclude='tmp-files' \
  --exclude='docs' \
  --exclude='sql' \
  -czf - . | \
sshpass -p "${PRD_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${PRD_PORT}" "${PRD_USER}@${PRD_HOST}" \
  "cd ${PRD_DIR} && tar -xzf - && find . -name '._*' -delete"

# 4a. ensure LINE_ENABLED=true is in prod's .env so outbound LINE messaging
# stays on. The env file is excluded from the tarball (line 67) so this
# guarantees the flag exists even on a fresh prod box. Dev keeps LINE_ENABLED=false
# in its own .env.local to block testers from pushing to real customers.
echo "🔧 Ensuring LINE_ENABLED=true on prod .env ..."
sshpass -p "${PRD_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${PRD_PORT}" "${PRD_USER}@${PRD_HOST}" \
  "cd ${PRD_DIR} && touch .env && \
   if grep -q '^LINE_ENABLED=' .env; then \
     sed -i 's/^LINE_ENABLED=.*/LINE_ENABLED=true/' .env; \
   else \
     echo 'LINE_ENABLED=true' >> .env; \
   fi && \
   grep '^LINE_ENABLED=' .env"

# 4. ensure uploads dir is writable by the container (uid 1001 = nextjs user
#    inside the image; host dir must be owned by that uid so bind-mount writes
#    don't EACCES).
sshpass -p "${PRD_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${PRD_PORT}" "${PRD_USER}@${PRD_HOST}" \
  "mkdir -p ${PRD_DIR}/uploads && echo '${PRD_PASS}' | sudo -S chown -R 1001:1001 ${PRD_DIR}/uploads 2>/dev/null || true"

# 5. build + restart container on prod
echo "🔨 Building + restarting container on prod ..."
sshpass -p "${PRD_PASS}" ssh \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -p "${PRD_PORT}" "${PRD_USER}@${PRD_HOST}" \
  "set -o pipefail; cd ${PRD_DIR} && docker compose up -d --build 2>&1 | tail -5" \
  || { echo "❌ Build/restart บน prod ล้มเหลว — container เดิมยังรันอยู่ prod จึงยังเป็นเวอร์ชันก่อนหน้า"; \
       echo "   ดู log เต็ม: ssh -p ${PRD_PORT} ${PRD_USER}@${PRD_HOST} 'cd ${PRD_DIR} && docker compose build'"; exit 1; }

# 6. wait for health + smoke test via public URL
#
# เทียบ /api/version กับ package.json ด้วย — ถ้าเช็คแค่ HTTP 200 container เก่า
# ที่ยังรันอยู่ (กรณี build ล้ม) ก็ตอบ 200 ทำให้เข้าใจผิดว่า deploy สำเร็จ
WANT_VERSION="$(node -p "require('./package.json').version")"
echo "🔎 Smoke test (ต้องได้ v${WANT_VERSION}) ..."
for i in {1..12}; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${PUBLIC_URL}/" || echo "000")
  got=$(curl -s "${PUBLIC_URL}/api/version" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
  if [[ "$code" == "200" && "$got" == "$WANT_VERSION" ]]; then
    echo "✅ ${PUBLIC_URL} → HTTP 200 · v${got}"

    # 7. tag ไว้ในเครื่องให้รู้ว่า prod = commit ไหน และย้อนกลับได้
    #
    # สคริปต์นี้ "ไม่ push" อะไรทั้งสิ้น — การส่งขึ้น GitHub เป็นการตัดสินใจของคน
    # ไม่ใช่ผลข้างเคียงของการ deploy · push เองภายหลังด้วย
    #   git push && git push origin v<version>
    TAG="v${WANT_VERSION}"
    if [[ "${ALLOW_DIRTY:-0}" != "1" ]]; then
      if git rev-parse "$TAG" >/dev/null 2>&1; then
        echo "ℹ️  tag ${TAG} มีอยู่แล้ว ข้ามการสร้าง"
      else
        git tag -a "$TAG" -m "deploy to prod $(date '+%Y-%m-%d %H:%M')"
        echo "🏷️  สร้าง tag ${TAG} ไว้ในเครื่อง (ยังไม่ push)"
      fi
    fi
    exit 0
  fi
  echo "  waiting... (${i}/12, http ${code}, version '${got:-?}')"
  sleep 5
done

echo "❌ Smoke test ไม่ผ่านใน 60 วินาที (ต้องการ v${WANT_VERSION})"
echo "   ถ้า HTTP 200 แต่เวอร์ชันไม่ตรง = container เก่ายังรันอยู่ แปลว่า build ไม่สำเร็จ"
echo "   ดู log: ssh -p ${PRD_PORT} ${PRD_USER}@${PRD_HOST} 'cd ${PRD_DIR} && docker compose logs app --tail 50'"
exit 1
