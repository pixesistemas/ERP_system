# ---------- Frontend build ----------
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---------- Backend deps + runtime ----------
FROM node:22-bookworm-slim AS backend
ENV NODE_ENV=production
ENV TZ=America/Argentina/Buenos_Aires

# Dependencias de sistema para: better-sqlite3 (native) y Chromium (puppeteer/PDF)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    openssl \
    ca-certificates \
    fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 \
    libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxkbcommon0 libxrandr2 libxrender1 libxshmfence1 \
    libxss1 libxtst6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./
# Estáticos del frontend servidos por Express en /app/frontend/dist
RUN mkdir -p /app/data /app/backend/storage /app/frontend/dist
COPY --from=frontend /app/frontend/dist ./../frontend/dist

# Almacenes persistentes (montados como volúmenes en compose):
# /app/data -> base SQLite (DB_PATH) ; /app/backend/storage -> PDF y QR
VOLUME ["/app/data", "/app/backend/storage"]

EXPOSE 3000

ENV DB_PATH=/app/data/afip_api.db
CMD ["node", "src/server.js"]
