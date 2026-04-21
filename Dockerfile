# syntax=docker/dockerfile:1.7
# Multi-stage build for Next.js 16 (standalone output). Pins node:20-slim so
# native modules (canvas, puppeteer) build without fighting musl on alpine.
# Final image listens on port 80 because the UAT gateway forwards there.

###############################################################################
# 1. deps — install production + dev deps once; cached by package-lock.json
###############################################################################
FROM node:20-slim AS deps
WORKDIR /app
# Build tools + libs needed by `canvas` (cairo/pango/giflib/jpeg) and anything
# else that still ships with node-gyp. python3 is required by node-gyp itself.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
      pkg-config \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

###############################################################################
# 2. builder — compile Next into `.next/standalone`
###############################################################################
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# puppeteer downloads chromium at install time; during build we only need it
# listed as a dep, skip the binary fetch to keep the image smaller.
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN npm run build

###############################################################################
# 3. runner — minimal runtime image (no dev build tools, no devDependencies)
###############################################################################
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next's standalone server respects PORT/HOSTNAME env vars.
ENV PORT=80
ENV HOSTNAME=0.0.0.0
ENV TZ=Asia/Bangkok

# Runtime libs for canvas + chromium (puppeteer). Install only the shared libs,
# not the -dev headers, to keep the final image small.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
      chromium \
      fonts-liberation fonts-thai-tlwg \
      ca-certificates tzdata \
      wget \
    && rm -rf /var/lib/apt/lists/*

# Tell puppeteer to use the system chromium we just installed instead of the one
# it tries to download from the puppeteer CDN.
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Non-root user so the container doesn't run as root. Chromium needs a
# writable HOME for its profile/crashpad state, so create the home dir
# explicitly.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --shell /bin/bash nextjs

# Standalone output ships only the runtime files Next actually needs.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Uploads dir is volume-mounted by compose, but ensure it exists inside the
# image so the first write doesn't fail when the volume is empty.
RUN mkdir -p /app/public/uploads && chown nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 80
CMD ["node", "server.js"]
