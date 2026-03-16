# Site Builder

Self-hosted website platform with storefront + admin panel. Runs on your own hardware — no monthly fees, no vendor lock-in.

Built for retail kiosks, but works for any store. Configure everything from the admin panel: products, pages, branding, colors, payments.

---

## Install (One Command)

### Any Linux server
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/btzll1412/sitebuilder/main/scripts/install.sh)
```
Auto-detects your environment. Installs Docker if needed, clones the repo, builds, and starts everything.

### Proxmox (creates an LXC container)
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/btzll1412/sitebuilder/main/scripts/install.sh) \
  --method=lxc --ip=192.168.1.50/24 --gateway=192.168.1.1
```

### Already have Docker
```bash
git clone https://github.com/btzll1412/sitebuilder.git
cd sitebuilder
docker compose up -d
```

### Custom port
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/btzll1412/sitebuilder/main/scripts/install.sh) --port=8080
```

After install:
- **Storefront:** `http://<your-ip>/`
- **Admin panel:** `http://<your-ip>/admin`
- **Login:** `admin` / `admin123` — **change this on first login**

---

## Installer Options

| Flag | Default | Description |
|------|---------|-------------|
| `--method=docker\|lxc` | auto-detect | Force Docker or Proxmox LXC |
| `--port=80` | `80` | Host port (Docker only) |
| `--ctid=200` | `200` | Container ID (LXC only) |
| `--ip=dhcp` | `dhcp` | Container IP (LXC only) — `dhcp` or `192.168.1.50/24` |
| `--gateway=` | — | Gateway (LXC, required for static IP) |
| `--bridge=vmbr0` | `vmbr0` | Network bridge (LXC only) |
| `--storage=local-lvm` | `local-lvm` | Storage pool (LXC only) |

---

## Managing

### Docker
```bash
cd /opt/sitebuilder
docker compose logs -f        # view logs
docker compose restart        # restart
docker compose down           # stop
docker compose up -d --build  # rebuild after update
```

### LXC
```bash
pct enter 200                 # shell into container
pct stop 200                  # stop
pct start 200                 # start
# Inside container:
systemctl restart kiosk-api   # restart API
journalctl -u kiosk-api -f   # view API logs
```

---

## What's Inside

- **Storefront** — Product browsing, cart, checkout with USAePay payment processing (simulation mode by default)
- **Admin panel** — Page builder, product manager, order history, store settings
- **Page builder** — Drag-and-drop blocks: hero banners, product grids, text, images, testimonials, and more
- **Self-contained** — SQLite database, no external services required

## Tech Stack

- **Frontend:** React, custom CSS (no UI framework)
- **Backend:** FastAPI, SQLite, bcrypt auth
- **Serve:** Nginx + Uvicorn
- **Deploy:** Docker or Proxmox LXC

---

## Development

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
npm install
npm start
```

Tests:
```bash
pytest tests/test_api.py -v
npm test -- --watchAll=false
```
