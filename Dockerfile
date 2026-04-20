# syntax=docker/dockerfile:1.7
# Multi-stage build for Next.js 16 (standalone output). Pins node:20-alpine.
# Final image listens on port 80 because the UAT gateway forwards there.

###############################################################################
# 1. deps — install production + dev deps once; cached by package-lock.json
###############################################################################
FROM node:20-alpine AS deps
WORKDIR /app
# libc6-compat is what Next.js docs recommend on alpine for sharp/puppeteer deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

###############################################################################
# 2. builder — compile Next into `.next/standalone`
###############################################################################
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Disable Next's telemetry on build for determinism.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

###############################################################################
# 3. runner — minimal runtime image (no source, no devDependencies)
###############################################################################
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next's standalone server respects PORT/HOSTNAME env vars.
ENV PORT=80
ENV HOSTNAME=0.0.0.0
ENV TZ=Asia/Bangkok

# Non-root user to keep the container unprivileged.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Standalone output ships only the runtime files Next needs.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Uploads dir is volume-mounted by compose, but ensure it exists inside the image
# so the first write doesn't fail when the volume is empty.
RUN mkdir -p /app/public/uploads && chown nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 80
CMD ["node", "server.js"]
