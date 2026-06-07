# ── Build stage ───────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ── Runtime stage ─────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init curl

# Security: non-root user
RUN addgroup -g 1000 appgroup && \
    adduser  -u 1000 -G appgroup -s /bin/sh -D appuser

WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --chown=appuser:appgroup src/ ./src/
COPY --chown=appuser:appgroup package.json ./

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
