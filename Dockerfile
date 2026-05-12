# syntax=docker/dockerfile:1

# =========================================
# Stage 1: Dependencies
# =========================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else npm i; \
  fi

# =========================================
# Stage 2: Build
# =========================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No build-time configuration.
# All runtime values (URLs, branding, theme, texts) are injected via container
# env vars and read at request time through `next-runtime-env`. The same image
# runs in every environment — no rebuild per stage or per tenant.

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# =========================================
# Stage 3: Production
# =========================================
FROM node:20-alpine AS runner
WORKDIR /app

ARG VERSION=dev
LABEL org.opencontainers.image.title="kratos-login-ui"
LABEL org.opencontainers.image.description="Brand-agnostic, runtime-configurable Ory Kratos self-service UI"
LABEL org.opencontainers.image.source="https://github.com/w6d-io/kratos-login-ui"
LABEL org.opencontainers.image.url="https://github.com/w6d-io/kratos-login-ui"
LABEL org.opencontainers.image.documentation="https://github.com/w6d-io/kratos-login-ui#readme"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="${VERSION}"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_VERSION="${VERSION}"

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
