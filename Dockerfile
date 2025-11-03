# syntax=docker/dockerfile:1.5

ARG NODE_VERSION=20.18.0

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm" \
  NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
# nextjs runtime needs a non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
