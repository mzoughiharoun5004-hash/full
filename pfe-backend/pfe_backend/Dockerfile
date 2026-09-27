# ==============================================================================
# Multi-stage Dockerfile for NestJS 11 API with Headless Chromium (Puppeteer 25)
# Architecture-agnostic: Native ARM64 & x86_64 (Node 22 LTS)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build NestJS API
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime with System Chromium & dumb-init
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install system dependencies for Chromium, standard CJK/Liberation fonts & dumb-init
# Acquire::Retries/Timeout added: the chromium dependency tree is ~150 packages,
# which cascades into repeated "Ign" skips and a full build failure on any
# flaky/VPN-filtered connection to deb.debian.org without explicit retries.
RUN apt-get update \
    -o Acquire::Retries=5 \
    -o Acquire::http::Timeout=30 \
    -o Acquire::https::Timeout=30 \
    && apt-get install -y --no-install-recommends \
    -o Acquire::Retries=5 \
    -o Acquire::http::Timeout=30 \
    chromium \
    fonts-liberation \
    fonts-freefont-ttf \
    ca-certificates \
    dumb-init \
    libnss3 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Hardened non-root user execution
RUN groupadd -g 1001 nestjs && \
    useradd -u 1001 -g nestjs -m -s /bin/bash nestjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Persistent uploads folder ownership
RUN mkdir -p /app/uploads && chown -R nestjs:nestjs /app

USER nestjs

EXPOSE 3001

# dumb-init reaps zombie chromium processes and handles SIGTERM/SIGINT cleanly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]
