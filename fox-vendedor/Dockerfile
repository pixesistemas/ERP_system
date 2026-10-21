# ---------- Dependencias nativas ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---------- Runtime ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    TZ=America/Argentina/Buenos_Aires \
    PORT=3100 \
    DB_PATH=/app/data/fox-vendedor.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/ ./
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
