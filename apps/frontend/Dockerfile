# Multi-stage Dockerfile for SIPMAS Frontend Next.js Service
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@12.3.4

# Copy monorepo manifests and frontend source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/frontend/ ./apps/frontend/

# Install dependencies with workspace filter and frozen lockfile
RUN pnpm install --frozen-lockfile --filter frontend...

# Build-time environment variable for Next.js API URLs
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG INTERNAL_API_URL=http://backend:5001
ENV INTERNAL_API_URL=$INTERNAL_API_URL

RUN pnpm --filter frontend run build

# Deploy isolated production dependencies
RUN pnpm --filter frontend --prod deploy /app/deployed

# Production runner stage (Non-root user)
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl

ENV NODE_ENV=production \
    PORT=3000 \
    INTERNAL_API_URL=http://backend:5001

# Copy deployed production files with ownership set to non-root node user
COPY --from=builder --chown=node:node /app/deployed/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/deployed/package.json ./package.json
COPY --from=builder --chown=node:node /app/apps/frontend/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=node:node /app/apps/frontend/.next ./.next
COPY --from=builder --chown=node:node /app/apps/frontend/public ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["npx", "next", "start", "-p", "3000"]
