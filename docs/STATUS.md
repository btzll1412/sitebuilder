# Project Status
Last updated: 2026-03-16

## Phase
Active Dev — all features implemented, tests passing

## Works
- Project scaffold (folder structure, configs, .gitignore)
- Backend API (FastAPI, SQLite, all routes, bcrypt auth, rate limiting)
- Database with seed data (admin, 6 products, home page, settings)
- Frontend scaffold (React router, CSS design system, api.js, CartContext, Toast)
- Admin login screen with form validation, loading states
- Admin shell with sidebar navigation (Products, Pages, Orders, Settings)
- Products manager (CRUD, image upload, drag reorder, bulk actions, category filter)
- Page builder (10 block types, inline editors, reorder, live preview, page CRUD)
- PageRenderer (all block types, scroll animations, product cards with hover effects)
- Kiosk shell (Navbar, slug routing, loading/error states)
- Cart drawer (3-step flow: cart → payment → confirmation, quantity controls)
- Settings panel (branding, colors, tax, USAePay config, change password)
- Orders panel (stats cards, expandable order list, status badges)
- Backend tests (38 passing pytest tests covering all routes)
- Frontend test stubs (RTL + Jest)
- Deploy script (Proxmox LXC provisioning)

## In Progress
- Design audit and polish
- Frontend test execution (need npm install for RTL)

## Not Started
- Production deployment
- Real USAePay integration testing
