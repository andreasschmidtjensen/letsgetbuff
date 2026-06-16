# syntax=docker/dockerfile:1
# Multi-stage build: compile client + server, then run with minimal image.
# Node 22+ required for the built-in node:sqlite module.

# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for layer-caching
COPY package.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all deps (workspaces). Alpine has python3+make+g++ for native addons.
RUN apk add --no-cache python3 make g++ && \
    npm install --workspaces --ignore-scripts && \
    npm rebuild

# Copy all source
COPY shared/ ./shared/
COPY client/ ./client/
COPY server/ ./server/

# Build: shared first (server imports it at runtime), then client and server
RUN npm run build -w shared
RUN npm run build -w client
RUN npm run build -w server

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Only production deps
COPY package.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN apk add --no-cache python3 make g++ && \
    npm install --workspaces --omit=dev --ignore-scripts && \
    npm rebuild && \
    apk del python3 make g++

# Compiled server
COPY --from=builder /app/server/dist ./server/dist

# Compiled shared (needed at runtime via workspace symlink)
COPY --from=builder /app/shared/dist ./shared/dist

# Built client (static files served by the server)
COPY --from=builder /app/client/dist ./client/dist

# Data dir for buff.db (should be a named volume in production)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=8585
ENV BUFF_DB_PATH=/data/buff.db
ENV STATIC_DIR=/app/client/dist
# CWA_DB_PATH and SESSION_SECRET must be set at runtime (see docker-compose.yml)

EXPOSE 8585

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8585/api/health || exit 1

CMD ["node", "--experimental-sqlite", "server/dist/index.js"]
