# Multi-stage Dockerfile for SIPMAS Backend Express Service
FROM node:20-alpine AS builder

WORKDIR /app

ENV DATABASE_URL="mysql://build:build@localhost:3306/build"

RUN apk add --no-cache openssl
RUN npm install -g pnpm@12.3.4

# Copy monorepo manifests and backend source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/backend/ ./apps/backend/

# Install dependencies with workspace filter and frozen lockfile
RUN pnpm install --frozen-lockfile --filter backend...

# Generate Prisma Client and build TypeScript
RUN DATABASE_URL="mysql://build:build@localhost:3306/build" pnpm --filter backend exec prisma generate
RUN pnpm --filter backend run build

# Deploy isolated production dependencies and generate production Prisma Client
RUN pnpm --filter backend --prod deploy /app/deployed
COPY apps/backend/prisma /app/deployed/prisma
RUN cd /app/deployed && npx prisma generate

# Production runner stage (Non-root user)
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl curl

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=192" \
    PORT=5001

# Copy deployed production files with ownership set to non-root node user
COPY --from=builder --chown=node:node /app/deployed/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/deployed/package.json ./package.json
COPY --from=builder --chown=node:node /app/apps/backend/dist ./dist
COPY --from=builder --chown=node:node /app/apps/backend/prisma ./prisma

# Create public/uploads directory owned by node user
RUN mkdir -p public/uploads && chown -R node:node /app

USER node

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

CMD ["node", "dist/server.js"]
