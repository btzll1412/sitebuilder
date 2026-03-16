#!/bin/bash
#
# Site Builder — One-Command Installer
#
# Run on Proxmox:
#   bash <(curl -fsSL https://raw.githubusercontent.com/btzll1412/sitebuilder/main/scripts/install.sh)
#
# Or with options:
#   curl -fsSL https://raw.githubusercontent.com/btzll1412/sitebuilder/main/scripts/install.sh | bash -s -- --method=docker --port=8080
#   curl -fsSL https://raw.githubusercontent.com/btzll1412/sitebuilder/main/scripts/install.sh | bash -s -- --method=lxc --ip=192.168.1.50/24
#

set -euo pipefail

# ─── Defaults ───────────────────────────────────────────────────────────────

REPO="https://github.com/btzll1412/sitebuilder.git"
METHOD=""          # auto-detect: docker or lxc
PORT="80"          # Docker port mapping
CTID="200"         # LXC container ID
IP="dhcp"          # LXC IP — "dhcp" or "192.168.1.200/24"
GATEWAY=""         # LXC gateway — required if static IP
BRIDGE="vmbr0"     # LXC bridge
STORAGE="local-lvm"
HOSTNAME="sitebuilder"

# ─── Colors ─────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ─── Parse Arguments ────────────────────────────────────────────────────────

for arg in "$@"; do
    case "$arg" in
        --method=*)  METHOD="${arg#*=}" ;;
        --port=*)    PORT="${arg#*=}" ;;
        --ctid=*)    CTID="${arg#*=}" ;;
        --ip=*)      IP="${arg#*=}" ;;
        --gateway=*) GATEWAY="${arg#*=}" ;;
        --bridge=*)  BRIDGE="${arg#*=}" ;;
        --storage=*) STORAGE="${arg#*=}" ;;
        --help|-h)
            echo ""
            echo -e "${BOLD}Site Builder Installer${NC}"
            echo ""
            echo "Usage: bash install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --method=docker|lxc   Install method (auto-detected if omitted)"
            echo "  --port=80             Port for Docker (default: 80)"
            echo "  --ctid=200            Container ID for LXC (default: 200)"
            echo "  --ip=dhcp             IP for LXC — 'dhcp' or '192.168.1.50/24'"
            echo "  --gateway=<ip>        Gateway for LXC (required for static IP)"
            echo "  --bridge=vmbr0        Bridge for LXC (default: vmbr0)"
            echo "  --storage=local-lvm   Storage for LXC (default: local-lvm)"
            echo ""
            echo "Examples:"
            echo "  # Auto-detect and install"
            echo "  bash install.sh"
            echo ""
            echo "  # Docker on port 8080"
            echo "  bash install.sh --method=docker --port=8080"
            echo ""
            echo "  # Proxmox LXC with static IP"
            echo "  bash install.sh --method=lxc --ip=192.168.1.50/24 --gateway=192.168.1.1"
            echo ""
            exit 0
            ;;
        *) warn "Unknown option: $arg" ;;
    esac
done

# ─── Banner ─────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         Site Builder — Installer              ║${NC}"
echo -e "${BOLD}║   Self-hosted storefront + admin panel        ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# ─── Auto-detect install method ─────────────────────────────────────────────

if [ -z "$METHOD" ]; then
    if command -v pct &> /dev/null; then
        METHOD="lxc"
        info "Detected Proxmox — will create LXC container"
    elif command -v docker &> /dev/null; then
        METHOD="docker"
        info "Detected Docker — will use docker compose"
    else
        echo ""
        echo "No Proxmox (pct) or Docker found."
        echo ""
        echo "What would you like to do?"
        echo "  1) Install Docker and deploy (recommended)"
        echo "  2) Exit — I'll install Docker myself"
        echo ""
        read -rp "Choice [1]: " choice
        choice="${choice:-1}"
        if [ "$choice" = "1" ]; then
            METHOD="docker-install"
        else
            echo ""
            echo "Install Docker first:"
            echo "  curl -fsSL https://get.docker.com | sh"
            echo ""
            echo "Then re-run this script."
            exit 0
        fi
    fi
fi

# ─── Docker Install Path ───────────────────────────────────────────────────

install_docker() {
    if command -v docker &> /dev/null; then
        log "Docker already installed"
        return
    fi
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "Docker installed"
}

deploy_docker() {
    local INSTALL_DIR="/opt/sitebuilder"

    # Install Docker if needed
    if [ "$METHOD" = "docker-install" ]; then
        install_docker
    fi

    # Check docker compose
    if docker compose version &> /dev/null; then
        COMPOSE="docker compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE="docker-compose"
    else
        err "docker compose not found. Install Docker Compose plugin first."
    fi

    # Clone or update repo
    if [ -d "$INSTALL_DIR/.git" ]; then
        info "Updating existing installation..."
        cd "$INSTALL_DIR"
        git pull --ff-only origin main
    else
        info "Cloning repository..."
        rm -rf "$INSTALL_DIR"
        git clone --depth 1 "$REPO" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi

    # Set port if non-default
    if [ "$PORT" != "80" ]; then
        sed -i "s/\"80:80\"/\"${PORT}:80\"/" docker-compose.yml
    fi

    # Build and start
    info "Building container (this takes 2-3 minutes on first run)..."
    $COMPOSE build --no-cache
    $COMPOSE up -d

    log "Container is starting..."
    sleep 5

    # Health check
    for i in $(seq 1 15); do
        if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
            break
        fi
        sleep 2
    done

    if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
        log "Site Builder is running!"
    else
        warn "Container is still starting — give it a moment"
    fi

    # Get IP for display
    local HOST_IP
    HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
    local PORT_SUFFIX=""
    [ "$PORT" != "80" ] && PORT_SUFFIX=":${PORT}"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
    echo ""
    echo "  Storefront:  http://${HOST_IP}${PORT_SUFFIX}/"
    echo "  Admin panel: http://${HOST_IP}${PORT_SUFFIX}/admin"
    echo "  Login:       admin / admin123"
    echo ""
    echo -e "  ${YELLOW}Change the default password on first login!${NC}"
    echo ""
    echo "  Manage:"
    echo "    cd ${INSTALL_DIR}"
    echo "    ${COMPOSE} logs -f        # view logs"
    echo "    ${COMPOSE} restart        # restart"
    echo "    ${COMPOSE} down           # stop"
    echo "    ${COMPOSE} up -d --build  # rebuild after update"
    echo ""
}

# ─── LXC Install Path ──────────────────────────────────────────────────────

deploy_lxc() {
    if ! command -v pct &> /dev/null; then
        err "pct not found — this must be run on a Proxmox host"
    fi

    if pct status "$CTID" &> /dev/null; then
        err "Container $CTID already exists. Use --ctid=<other> or remove it first."
    fi

    # Template
    local TEMPLATE="local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
    if ! ls /var/lib/vz/template/cache/ubuntu-22.04* &> /dev/null 2>&1; then
        info "Downloading Ubuntu 22.04 template..."
        pveam update
        pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst || err "Failed to download template"
    fi

    # Network config
    local NET_CONFIG
    if [ "$IP" = "dhcp" ]; then
        NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=dhcp"
    else
        [ -z "$GATEWAY" ] && err "Static IP requires --gateway (e.g. --gateway=192.168.1.1)"
        NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=${IP},gw=${GATEWAY}"
    fi

    local ROOT_PW
    ROOT_PW=$(openssl rand -base64 16 2>/dev/null || echo "changeme123!")

    info "Creating LXC container ${CTID}..."
    pct create "$CTID" "$TEMPLATE" \
        --hostname "$HOSTNAME" \
        --memory 1024 \
        --cores 2 \
        --rootfs "${STORAGE}:8" \
        --net0 "$NET_CONFIG" \
        --password "$ROOT_PW" \
        --unprivileged 1 \
        --features nesting=1 \
        --start 1

    sleep 5

    info "Installing system packages (this takes a few minutes)..."
    pct exec "$CTID" -- bash -c '
        apt-get update -qq
        apt-get install -y -qq curl nginx python3 python3-pip python3-venv git > /dev/null 2>&1
    '

    info "Installing Node.js 20..."
    pct exec "$CTID" -- bash -c '
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
        apt-get install -y -qq nodejs > /dev/null 2>&1
    '

    info "Cloning repository..."
    pct exec "$CTID" -- bash -c "
        git clone --depth 1 ${REPO} /opt/kiosk
    "

    info "Building frontend (takes 1-2 minutes)..."
    pct exec "$CTID" -- bash -c '
        cd /opt/kiosk
        npm ci --silent 2>&1 | tail -1
        npm run build 2>&1 | tail -3
    '

    info "Setting up Python backend..."
    pct exec "$CTID" -- bash -c '
        cd /opt/kiosk/backend
        python3 -m venv /opt/kiosk-venv
        /opt/kiosk-venv/bin/pip install -q -r requirements.txt 2>&1 | tail -1
    '

    pct exec "$CTID" -- bash -c 'mkdir -p /opt/kiosk/data /opt/kiosk/uploads'

    info "Configuring services..."
    pct exec "$CTID" -- bash -c 'cat > /etc/systemd/system/kiosk-api.service << EOF
[Unit]
Description=Site Builder API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/kiosk/backend
ExecStart=/opt/kiosk-venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable kiosk-api
systemctl start kiosk-api
'

    pct exec "$CTID" -- bash -c 'cat > /etc/nginx/sites-available/sitebuilder << EOF
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 20M;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        alias /opt/kiosk/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        root /opt/kiosk/build;
        try_files \$uri \$uri/ /index.html;
        expires 1h;
    }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/sitebuilder /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
'

    # Wait for API
    info "Waiting for API..."
    pct exec "$CTID" -- bash -c '
        for i in $(seq 1 15); do
            curl -sf http://localhost:8000/api/health > /dev/null 2>&1 && exit 0
            sleep 2
        done
        exit 1
    ' && log "API is healthy!" || warn "API is still starting — give it a moment"

    # Get container IP
    local CONTAINER_IP
    if [ "$IP" = "dhcp" ]; then
        sleep 2
        CONTAINER_IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}' || echo "<container-ip>")
    else
        CONTAINER_IP=$(echo "$IP" | cut -d'/' -f1)
    fi

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
    echo ""
    echo "  Container:   ${CTID} (${HOSTNAME})"
    echo "  Storefront:  http://${CONTAINER_IP}/"
    echo "  Admin panel: http://${CONTAINER_IP}/admin"
    echo "  Login:       admin / admin123"
    echo "  Root PW:     ${ROOT_PW}"
    echo ""
    echo -e "  ${YELLOW}Change both passwords on first login!${NC}"
    echo ""
    echo "  Manage:"
    echo "    pct enter ${CTID}              # shell into container"
    echo "    pct stop ${CTID}               # stop"
    echo "    pct start ${CTID}              # start"
    echo "    systemctl restart kiosk-api    # (inside container) restart API"
    echo ""
}

# ─── Run ────────────────────────────────────────────────────────────────────

case "$METHOD" in
    docker|docker-install)
        deploy_docker
        ;;
    lxc)
        deploy_lxc
        ;;
    *)
        err "Unknown method: $METHOD. Use --method=docker or --method=lxc"
        ;;
esac
