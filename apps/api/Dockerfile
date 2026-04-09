# Multi-stage build for NestJS API
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod=false

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
# Generate Prisma client
RUN cd packages/database && npx prisma generate
# Build shared package first (API depends on it)
RUN pnpm --filter @luka/shared build
# Build database package
RUN pnpm --filter @luka/database build
# Build API (uses SWC via nest-cli)
RUN pnpm --filter @luka/api build

# Production
FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built API
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/node_modules ./node_modules

# Copy Prisma client and schema
COPY --from=builder /app/packages/database/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/packages/database/prisma ./prisma

# Copy workspace dependencies that are resolved at runtime
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder /app/packages/database/dist ./node_modules/@luka/database/dist
COPY --from=builder /app/packages/database/package.json ./node_modules/@luka/database/package.json
COPY --from=builder /app/packages/shared/dist ./node_modules/@luka/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@luka/shared/package.json

# Entrypoint runs migrations then starts the app
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh

USER nestjs
EXPOSE 3001
ENV NODE_ENV=production
ENV API_PORT=3001

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
