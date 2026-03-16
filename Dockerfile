# ─── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copy package files and install deps
COPY package.json package-lock.json* ./
RUN npm ci --silent

# CRA expects src/ and public/ at the same level as package.json
COPY frontend/src/ src/
COPY frontend/public/ public/

RUN npm run build

# ─── Stage 2: Production image ─────────────────────────────────────────────
FROM python:3.11-slim

# Install nginx and supervisor
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends nginx supervisor curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/kiosk

# Python dependencies
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend
COPY backend/ backend/

# Copy built frontend from stage 1
COPY --from=frontend-build /app/build/ build/

# Create data and uploads directories
RUN mkdir -p data uploads

# Nginx config
COPY docker/nginx.conf /etc/nginx/sites-available/default
RUN rm -f /etc/nginx/sites-enabled/default && \
    ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Supervisor config (runs both nginx + uvicorn)
COPY docker/supervisord.conf /etc/supervisor/conf.d/sitebuilder.conf

# Entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Persist data and uploads
VOLUME ["/opt/kiosk/data", "/opt/kiosk/uploads"]

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -sf http://localhost/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
