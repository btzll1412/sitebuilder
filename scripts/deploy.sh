#!/bin/bash
#
# deploy.sh — Proxmox LXC provisioning for Site Builder Platform
#
# Run this on the Proxmox host:
#   bash deploy.sh
#
# After deploy:
#   Kiosk:  http://<IP>/
#   Admin:  http://<IP>/admin
#   Login:  admin / admin123 (change on first login!)
#

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

CTID="${CTID:-200}"
STORAGE="${STORAGE:-local-lvm}"
BRIDGE="${BRIDGE:-vmbr0}"
IP="${IP:-192.168.1.200/24}"
GATEWAY="${GATEWAY:-192.168.1.1}"
HOSTNAME="${HOSTNAME:-sitebuilder}"
ROOT_PASSWORD="${ROOT_PASSWORD:-changeme}"

TEMPLATE="local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
MEMORY=1024
CORES=2
DISK_SIZE="8G"
APP_DIR="/opt/kiosk"

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── Pre-checks ─────────────────────────────────────────────────────────────

log "Site Builder Deployment — Proxmox LXC"
echo ""
echo "  CTID:       $CTID"
echo "  Storage:    $STORAGE"
echo "  Bridge:     $BRIDGE"
echo "  IP:         $IP"
echo "  Gateway:    $GATEWAY"
echo "  Hostname:   $HOSTNAME"
echo ""

# Check if running on Proxmox
if ! command -v pct &> /dev/null; then
    err "This script must be run on a Proxmox host (pct not found)"
fi

# Check if CTID already exists
if pct status "$CTID" &> /dev/null; then
    err "Container $CTID already exists. Remove it first or choose a different CTID."
fi

# Check template exists
if ! ls /var/lib/vz/template/cache/ubuntu-22.04* &> /dev/null; then
    log "Downloading Ubuntu 22.04 template..."
    pveam update
    pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst || err "Failed to download template"
fi

# ─── Create Container ───────────────────────────────────────────────────────

log "Creating LXC container $CTID..."
pct create "$CTID" "$TEMPLATE" \
    --hostname "$HOSTNAME" \
    --memory "$MEMORY" \
    --cores "$CORES" \
    --rootfs "${STORAGE}:${DISK_SIZE}" \
    --net0 "name=eth0,bridge=${BRIDGE},ip=${IP},gw=${GATEWAY}" \
    --password "$ROOT_PASSWORD" \
    --unprivileged 1 \
    --features nesting=1 \
    --start 1

# Wait for container to start
sleep 5

# ─── Install Dependencies ───────────────────────────────────────────────────

log "Installing system packages..."
pct exec "$CTID" -- bash -c '
    apt-get update -qq
    apt-get install -y -qq curl nginx python3 python3-pip python3-venv git > /dev/null 2>&1
'

log "Installing Node.js 20..."
pct exec "$CTID" -- bash -c '
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    node --version
    npm --version
'

# ─── Copy Source Files ───────────────────────────────────────────────────────

log "Copying application files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Create app directory
pct exec "$CTID" -- mkdir -p "$APP_DIR"

# Copy files (excluding data, uploads, node_modules, etc.)
tar -C "$PROJECT_DIR" \
    --exclude='data' \
    --exclude='uploads' \
    --exclude='node_modules' \
    --exclude='build' \
    --exclude='__pycache__' \
    --exclude='.git' \
    --exclude='venv' \
    -czf /tmp/sitebuilder.tar.gz .

pct push "$CTID" /tmp/sitebuilder.tar.gz /tmp/sitebuilder.tar.gz
pct exec "$CTID" -- bash -c "cd $APP_DIR && tar -xzf /tmp/sitebuilder.tar.gz && rm /tmp/sitebuilder.tar.gz"
rm -f /tmp/sitebuilder.tar.gz

# ─── Build Frontend ─────────────────────────────────────────────────────────

log "Installing npm packages and building frontend..."
pct exec "$CTID" -- bash -c "
    cd $APP_DIR
    npm install --production=false --silent 2>&1 | tail -3
    npm run build 2>&1 | tail -5
"

# ─── Setup Python Backend ───────────────────────────────────────────────────

log "Setting up Python virtual environment..."
pct exec "$CTID" -- bash -c "
    cd $APP_DIR/backend
    python3 -m venv /opt/kiosk-venv
    /opt/kiosk-venv/bin/pip install -q -r requirements.txt 2>&1 | tail -3
"

# ─── Create Directories ─────────────────────────────────────────────────────

pct exec "$CTID" -- bash -c "
    mkdir -p $APP_DIR/data
    mkdir -p $APP_DIR/uploads
"

# ─── Systemd Service ────────────────────────────────────────────────────────

log "Creating systemd service..."
pct exec "$CTID" -- bash -c "cat > /etc/systemd/system/kiosk-api.service << 'UNIT'
[Unit]
Description=Site Builder API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/backend
ExecStart=/opt/kiosk-venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
UNIT"

pct exec "$CTID" -- bash -c "
    systemctl daemon-reload
    systemctl enable kiosk-api
    systemctl start kiosk-api
"

# ─── Nginx Configuration ────────────────────────────────────────────────────

log "Configuring Nginx..."
pct exec "$CTID" -- bash -c "cat > /etc/nginx/sites-available/sitebuilder << 'NGINX'
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 20M;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Uploaded files
    location /uploads/ {
        alias $APP_DIR/uploads/;
        expires 30d;
        add_header Cache-Control \"public, immutable\";
    }

    # React build — SPA fallback
    location / {
        root $APP_DIR/build;
        try_files \$uri \$uri/ /index.html;
        expires 1h;
    }
}
NGINX"

pct exec "$CTID" -- bash -c "
    rm -f /etc/nginx/sites-enabled/default
    ln -sf /etc/nginx/sites-available/sitebuilder /etc/nginx/sites-enabled/
    nginx -t
    systemctl restart nginx
"

# ─── Health Check ────────────────────────────────────────────────────────────

log "Waiting for API to start..."
sleep 3

pct exec "$CTID" -- bash -c '
    for i in $(seq 1 10); do
        if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
            echo "API is healthy!"
            exit 0
        fi
        sleep 2
    done
    echo "WARNING: API did not respond within 20 seconds"
    exit 1
'

# ─── Done ────────────────────────────────────────────────────────────────────

IP_CLEAN=$(echo "$IP" | cut -d'/' -f1)

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Kiosk:    http://${IP_CLEAN}/"
echo "  Admin:    http://${IP_CLEAN}/admin"
echo "  Login:    admin / admin123"
echo ""
echo -e "  ${YELLOW}⚠  Change the default password on first login!${NC}"
echo ""
