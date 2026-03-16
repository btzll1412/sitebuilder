# CLAUDE.md — Site Builder Platform

You are the sole developer on this project. Read this entire file before touching anything. Re-read it when switching tasks. Update the docs as you go.

---

## The Vision

We are building a **self-hosted website platform** that competes with Squarespace and Base44 — but runs locally on Proxmox, costs nothing in monthly fees, and gives the owner complete control. The first deployment is a **makeup store self-checkout kiosk** on a tablet with USAePay payment processing. But the platform must be generic enough to redeploy for any retail store with zero code changes.

To beat Squarespace and Base44 we need:
- A page builder that is genuinely easier and faster to use than theirs
- A storefront that looks more premium than their templates
- No per-month fee, no vendor lock-in, runs on the owner's hardware
- Full control: custom pages, custom product lines, custom colors, custom everything
- A checkout experience that feels native, not bolted-on

---

## Design Philosophy — This Is The Most Important Section

### This must NOT look like an AI-generated website. Ever.

If it looks like a template, redo it. If it looks like a Shadcn component, redo it. If the first adjective that comes to mind is "clean" or "minimal" in a generic way, redo it.

**Banned — never use these:**
- Inter, Roboto, DM Sans, system-ui, -apple-system, or any neutral sans-serif as the primary font
- Purple gradients on any background
- Blue as a primary brand color
- Generic card grids with identical padding and drop shadows
- Glassmorphism as a primary aesthetic
- Lucide or Heroicons as the main visual language
- White background + gray cards layout (default Shadcn/Tailwind look)
- "SaaS dashboard" aesthetic anywhere — this is retail, not software

**Mandatory aesthetic — Kiosk (customer-facing):**
- Font pairing: `Cormorant Garamond` (display, headings, product names, prices) + `Jost` (UI, body, buttons, labels). Load from Google Fonts. Never substitute.
- Backgrounds: layered near-blacks — #0d0d0d base, #141414 surfaces, #1c1c1c cards, #252525 elevated
- Text: warm off-white #f5f0eb primary, warm gray #a89f96 secondary
- Accent: brand rose #C2185B default — fully customizable by admin per-store
- Product cards: tall portrait ratio (roughly 3:4), image fills 75% of card, thin info strip at bottom
- Hover states: `translateY(-6px)` lift with a subtle warm glow — never color flash or border change
- Spacing: always more than you think. Luxury brands breathe.
- Motion: entrances on scroll (subtle fade+rise), hover lifts, cart drawer slides. Nothing bouncy or playful.
- Reference: Sephora's website meets an editorial fashion magazine. Not a Shopify theme.

**Mandatory aesthetic — Admin panel (owner-facing):**
- Light mode only. Warm whites: #f8f5f2 page bg, #ffffff card bg, #ece8e3 subtle surfaces
- Text: #1a1a1a primary, #6b6560 secondary, #9b9590 hints
- Same brand rose accent for active states, primary buttons
- Form inputs: warm-tinted background, no harsh blue focus rings — use brand color focus ring
- Layout: sidebar nav (220px fixed) + scrollable content area
- Feel: calm, editorial, professional. Like a well-designed CMS. Not a developer dashboard.
- Font: Jost throughout the admin (Cormorant for decorative moments like the logo/panel title)

**Every single screen** — ask yourself: does this look better than Squarespace's admin? Does the storefront look more premium than Base44's templates? If not, fix the design before moving on.

---

## Tech Stack

```
backend/
  main.py                 FastAPI — all API routes
  requirements.txt        fastapi, uvicorn[standard], python-multipart, httpx, pydantic, bcrypt

frontend/
  public/
    index.html
  src/
    index.js              React entry
    index.css             CSS variables, Google Fonts, global reset, animations
    App.js                Router: /admin/* → AdminShell, /* → KioskShell
    api.js                ALL fetch calls live here. No fetch() anywhere else.
    CartContext.js         Global cart state (Context + useReducer)
    components/
      Navbar.js           Kiosk top bar — logo, page nav, cart button + count
      CartDrawer.js       Slide-in panel: cart → payment → confirmation
      PageRenderer.js     Turns a layout block array into live UI
      Toast.js            Global toast notification system (success/error/info)
    admin/
      AdminApp.js         Sidebar shell + tab routing
      AdminLogin.js       Login screen
      PageBuilder.js      Drag-and-drop page editor — this is the crown jewel
      ProductsManager.js  Product CRUD with image upload, categories, sort
      OrdersPanel.js      Order history, totals, status
      SettingsPanel.js    All store config: branding, colors, USAePay, tax

data/                     SQLite (auto-created, gitignored)
uploads/                  Product images (auto-created, gitignored)
docs/
  STATUS.md               You maintain this — current state of the project
  ISSUES.md               You maintain this — bugs, workarounds, todos
  CHANGELOG.md            You maintain this — what changed and when
tests/
  test_api.py             pytest — backend coverage
  test_ui.js              React Testing Library — frontend coverage
scripts/
  deploy.sh               Proxmox LXC one-shot provisioning script
.gitignore
package.json              (root-level for frontend)
```

---

## Database Schema

SQLite at `backend/data/kiosk.db`. Call `init_db()` on startup. Seed with sample data so the first boot looks great, not empty.

```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  image TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  in_stock INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  layout TEXT DEFAULT '[]',        -- JSON array of blocks
  is_home INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- Default keys: site_name, logo_text, tax_rate, primary_color,
--               accent_color, usaepay_key, usaepay_pin, usaepay_sandbox

CREATE TABLE admins (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL       -- bcrypt, never SHA-256
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,           -- secrets.token_hex(32)
  admin_id INTEGER NOT NULL,
  expires_at REAL NOT NULL          -- unix timestamp, 7 days
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  items TEXT NOT NULL,              -- JSON array [{id, name, price, qty}]
  subtotal REAL NOT NULL,
  tax REAL NOT NULL,
  total REAL NOT NULL,
  payment_ref TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',    -- pending | approved | declined
  created_at TEXT DEFAULT (datetime('now'))
);
```

Seed data on init:
- 1 admin user: `admin` / `admin123` (bcrypt hashed)
- 6 sample products across 3 categories (Lips, Eyes, Face) — realistic names, prices, descriptions
- 1 home page with a hero block + product grid block
- All default site_settings values

---

## Page Layout Block System

`pages.layout` is a JSON array. Each element:

```json
{
  "id": "uid_abc123",
  "type": "block_type",
  "props": { }
}
```

### All block types

| Type | What it renders | Key props |
|------|----------------|-----------|
| `hero` | Full-width banner with title, subtitle, optional CTA button | title, subtitle, cta, badge, bg_color, bg_image |
| `product_grid` | Responsive grid of product cards pulled from DB | title, category (all or specific), limit, columns (2/3/4) |
| `text` | Heading + body copy block | title, body, align (left/center/right) |
| `banner` | Single-line promotional strip | text, bg_color, text_color |
| `image` | Full-width or contained image | src, alt, caption, width (full/contained) |
| `spacer` | Vertical whitespace | height (px) |
| `divider` | Horizontal rule | color, thickness |
| `testimonial` | Pull quote with attribution | quote, author, role |
| `two_column` | Two side-by-side content areas | left (block), right (block) |
| `category_grid` | Visual grid of category links | title, categories (array of {name, image, link}) |

The PageBuilder lets the admin add any block type, reorder them (drag or arrow buttons), configure every prop with appropriate inputs, and preview changes live before saving.

---

## API Routes

### Auth
```
POST   /api/auth/login              { username, password } → { token, username }
POST   /api/auth/logout             (auth) → { ok }
POST   /api/auth/change-password    (auth) { password } → { ok }
```

### Products
```
GET    /api/products                ?category= → [products] (in_stock=1 only)
GET    /api/products/all            (auth) → [all products including out of stock]
GET    /api/products/categories     → [string]
POST   /api/products                (auth, multipart/form-data) → product
PUT    /api/products/:id            (auth, multipart/form-data) → product
DELETE /api/products/:id            (auth) → { ok }
PATCH  /api/products/reorder        (auth) { ids: [ordered array] } → { ok }
```

### Pages
```
GET    /api/pages                   → [{ id, slug, title, is_home, published }]
GET    /api/pages/:slug             → page with layout parsed to array
POST   /api/pages                   (auth) { slug, title } → page
PUT    /api/pages/:id               (auth) { title, layout[], published } → { ok }
DELETE /api/pages/:id               (auth, non-home only) → { ok }
```

### Settings
```
GET    /api/settings                → settings object (no secret keys exposed)
GET    /api/settings/admin          (auth) → all settings including payment keys
PUT    /api/settings                (auth) { key: value, ... } → { ok }
```

### Checkout & Orders
```
POST   /api/checkout                { items[], card_number, card_exp, card_cvv, card_name }
                                    → { success, ref, total, simulated? }
GET    /api/orders                  (auth) → [orders with items parsed]
GET    /api/orders/stats            (auth) → { total_revenue, order_count, avg_order }
```

### Misc
```
GET    /api/health                  → { ok: true, version: "0.1.0" }
POST   /api/upload                  (auth) multipart image → { url }
```

---

## Payment Integration — USAePay

REST API v2. Basic auth: key as username, pin as password.
- Sandbox: `https://sandbox.usaepay.com/api/v2/transactions`
- Production: `https://secure.usaepay.com/api/v2/transactions`

Payload:
```json
{
  "command": "cc:sale",
  "amount": 49.99,
  "creditcard": {
    "number": "4111111111111111",
    "expiration": "0128",
    "cvv2": "123",
    "cardholder": "Jane Smith"
  }
}
```

Response: check `result === "Approved"` and grab `refnum`.

**Simulation mode:** if `usaepay_key` is blank, skip the API call, generate `SIM-XXXXXXXX` ref, mark approved. Always show "Simulation mode" badge on the receipt. This is the default out of the box.

Security:
- Never log card numbers, CVV, or full expiry
- Log only last 4 digits of card for order records
- Mask card fields in transit (HTTPS in production)

---

## Auth & Security Rules

- Passwords: **bcrypt** with 12 rounds. Never SHA-256, never MD5, never plaintext.
- Tokens: `secrets.token_hex(32)` — 64 char hex strings
- Session expiry: 7 days. Delete expired sessions on each login call.
- Every admin route: `admin_id = Depends(verify_token)`. No exceptions.
- Frontend: store token in `localStorage.admin_token`. On any 401, clear token + redirect to `/admin`.
- Rate limit login attempts: after 5 failed attempts in 10 minutes, return 429 with a message.

---

## Error Handling — Non-Negotiable

### Backend
- Every route in try/except. Raw Python exceptions never reach the client.
- All errors: `{ "detail": "human-readable message" }` with appropriate HTTP status
- 400 for bad input, 401 for auth, 403 for forbidden, 404 for not found, 429 for rate limit, 500 for server errors
- DB constraint violations → 400, not 500
- File upload issues (wrong type, too large) → 400 with clear message
- Never expose stack traces to the client

### Frontend
- Every api.js call wrapped in try/catch at the call site
- Errors → Toast notification (bottom-right, 3s, styled by type)
- Never silent failures. Never console.error only.
- Every button triggering async work: disabled + loading state during the request. No double-submits.
- Every list/grid: designed empty state (not a blank page)
- Network error → "Unable to reach the server. Check your connection." Not a JS error string.
- 401 from any call → auto-logout + redirect

### Form validation
- Client-side first: required fields, price > 0, slug format, etc.
- Inline field-level error messages (under the field, not just a toast)
- Disable submit until minimum required fields are valid

---

## Page Builder — The Crown Jewel

This is what makes us better than Base44. The admin opens a page, sees a canvas with all their blocks, and can:

1. **Add blocks** — sidebar palette with all block types, each with a preview thumbnail/icon and description. Click to add at the bottom, or drag to position.
2. **Reorder blocks** — drag handles on the left of each block, plus ↑↓ buttons for accessibility
3. **Edit block props** — clicking a block expands an inline editor with appropriate inputs for each prop type (text, textarea, color picker, number, image URL, select dropdown)
4. **Live preview toggle** — a "Preview" button shows how the page looks to customers, in a realistic viewport, without leaving the editor
5. **Add/delete pages** — from the pages list, create new pages (sets slug, title) or delete non-home pages
6. **Publish/unpublish** — toggle whether a page appears in navigation

The editor must be genuinely intuitive. A non-technical user should be able to build a page in under 5 minutes on their first try. If it feels confusing, simplify the UI.

---

## Product Manager — Better Than Shopify Basic

The admin can:
- View all products in a clean list with image thumbnails, name, category, price, stock status
- Filter by category
- Add a product: name, description, price, category (text input with autocomplete from existing), stock toggle, image upload (drag-drop or click), sort order
- Edit any product inline (expand row or modal — your call, make it feel fast)
- Delete with confirmation
- Drag to reorder within a category
- Bulk actions: toggle stock on/off for selected, bulk delete
- Image upload: accept JPG/PNG/WebP up to 10MB, show preview immediately, store in /uploads/

---

## Tests

### Backend — `tests/test_api.py`
Use pytest + httpx AsyncClient. Test every route. Minimum:
- Health check
- Login success + failure + rate limiting
- Auth middleware (protected routes without token → 401)
- Product CRUD cycle
- Duplicate slug → 400
- Page CRUD cycle
- Settings get/set
- Checkout simulation → approved, order in DB
- Orders list includes the new order
- Logout invalidates token

### Frontend — `tests/test_ui.js`  
Use React Testing Library + Jest. Mock api.js. Test:
- Home page renders
- Product card shows name and price
- Add to cart updates count
- Cart drawer opens, shows items, updates quantity, removes item
- Admin login: form renders, wrong credentials shows error
- Product form: required field validation

Run tests: `pytest tests/test_api.py -v` and `npm test --watchAll=false`

All tests must pass before any commit to main.

---

## Docs — You Maintain These

Update after every meaningful change.

### `docs/STATUS.md`
```markdown
# Project Status
Last updated: YYYY-MM-DD

## Phase
(Initial Build / Active Dev / Testing / Production)

## Works
-

## In Progress
-

## Not Started
-
```

### `docs/ISSUES.md`
```markdown
# Issues
Last updated: YYYY-MM-DD

## Open
- [BUG] description — workaround if any
- [TODO] feature gap — context

## Resolved
- [FIXED] description — fix summary
```

### `docs/CHANGELOG.md`
```markdown
# Changelog

## [Unreleased]
-

## [0.1.0] - YYYY-MM-DD
### Added
### Fixed
### Changed
```

---

## Git Discipline

Repo: https://github.com/btzll1412/sitebuilder

Branches:
- `main` — always deployable
- `dev` — active work, merge to main when a feature is complete and tested
- `feature/xxx`, `fix/xxx` for specific work

Commit format:
```
feat: add two_column block type
fix: cart total not updating on quantity change
style: redesign product card portrait layout
test: add checkout simulation test
docs: update STATUS after page builder complete
refactor: extract block editors into separate components
chore: update requirements.txt
```

Never commit: `data/`, `uploads/`, `.env`, `node_modules/`, `__pycache__/`, `venv/`, `build/`

---

## Deployment — Proxmox LXC

`scripts/deploy.sh` runs on the Proxmox host and provisions everything:

1. Create Ubuntu 22.04 LXC with configurable CTID, IP, storage, bridge
2. Install Node 20, Python 3.11, Nginx
3. Copy all source files into `/opt/kiosk/`
4. `npm install && npm run build` in frontend
5. Python venv + `pip install -r requirements.txt` in backend
6. systemd service `kiosk-api` — uvicorn on 127.0.0.1:8000, auto-restart
7. Nginx config: `/api/*` and `/uploads/*` proxied to uvicorn, everything else serves React build, SPA fallback to index.html, `client_max_body_size 20M`

Configurable at top of script: CTID, STORAGE, BRIDGE, IP, GATEWAY, HOSTNAME, ROOT_PASSWORD

After deploy:
- Kiosk: `http://<IP>/`
- Admin: `http://<IP>/admin`
- Default: admin / admin123 — **change on first login**

---

## Reusability — Every Future Deployment

When deploying for a new client:
1. Clone repo
2. Edit IP/CTID in deploy.sh
3. Run deploy.sh
4. Log into admin → Settings: set store name, logo, colors, USAePay keys, tax rate
5. Products: add their products
6. Pages: build their pages

Zero code changes. Everything is config. The "makeup store" is just seed data and admin settings — nothing is hardcoded to this client.

---

## Self-Review Before Every Commit

**Design**
- [ ] No banned fonts, colors, or patterns
- [ ] Touch targets ≥ 44×44px (kiosk is touch-only)
- [ ] Empty states exist and look designed
- [ ] Loading states on all async actions
- [ ] Kiosk renders correctly at 1024×768 (common tablet)
- [ ] Admin is comfortable at 1280px+
- [ ] Looks better than a Squarespace template
- [ ] Looks better than a Base44 storefront

**Code**
- [ ] No fetch() outside api.js
- [ ] No hardcoded credentials, IPs, or keys
- [ ] All backend routes have error handling
- [ ] All frontend async has try/catch and loading state
- [ ] bcrypt for passwords, never anything weaker

**Docs**
- [ ] STATUS.md is current
- [ ] ISSUES.md has any new known issues
- [ ] CHANGELOG.md has an entry

**Tests**
- [ ] Existing tests pass
- [ ] New behavior has a test

---

## Build Order

Start here, go in order, do not skip:

1. Project scaffold — folder structure, package.json, requirements.txt, .gitignore
2. Backend — main.py: DB init, all routes, auth, error handling, seeding
3. Frontend scaffold — App.js router, index.css with full design system (variables, fonts, resets, animations), api.js, CartContext.js, Toast.js
4. Admin login screen
5. Products manager — full CRUD, image upload, drag reorder
6. Page builder — block palette, block editors, reorder, save, live preview
7. PageRenderer — kiosk-side block rendering, all block types
8. Kiosk shell — Navbar, page loading, slug routing
9. Cart drawer — cart UI, quantity controls, 3-step payment (cart → payment form → confirmation)
10. Settings panel — branding, colors, USAePay, tax, change password
11. Orders panel — history, stats cards, status badges
12. Tests — pytest suite, RTL suite, all passing
13. Deploy script — full Proxmox LXC provisioning
14. Design audit — go through every screen, compare to Squarespace/Base44, fix anything that looks generic
15. Docs — STATUS, ISSUES, CHANGELOG all current

---

## The Bar We're Clearing

When this is done, show it to someone who has used Squarespace. They should say "this is nicer." Show it to someone who has used Base44. They should say "the admin is easier." That is the standard. Build to it.
