# syntax=docker/dockerfile:1.5

ARG NODE_VERSION=20.18.0
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AMAP_KEY

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm" \
  NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apk add --no-cache ffmpeg
ENV FFMPEG_PATH=/usr/bin/ffmpeg

FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

FROM base AS builder
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AMAP_KEY
ENV NODE_ENV=production
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_AMAP_KEY=${NEXT_PUBLIC_AMAP_KEY}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AMAP_KEY
ENV NODE_ENV=production
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_AMAP_KEY=${NEXT_PUBLIC_AMAP_KEY}
# nextjs runtime needs a non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
