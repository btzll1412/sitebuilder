# Changelog

## [Unreleased]
- Design audit and polish pass

## [0.1.0] - 2026-03-16
### Added
- Project scaffold: folder structure, package.json, requirements.txt, .gitignore
- Backend API: FastAPI with SQLite, all CRUD routes, bcrypt auth, rate limiting
- Database schema with seed data (admin user, 6 products, home page, settings)
- Frontend: React 18 with react-router-dom, CSS design system
- Design system: Cormorant Garamond + Jost fonts, dark kiosk palette, warm admin palette
- API client (api.js): centralized fetch with auth headers, 401 auto-logout
- Cart state management: Context + useReducer with add/remove/update/clear
- Toast notification system: success/error/info with auto-dismiss
- Admin login: form validation, loading states, error toasts
- Admin shell: 220px sidebar, tab routing, user info, logout
- Products manager: list with thumbnails, category filter, add/edit modal, image drag-drop upload, bulk actions, reorder
- Page builder: 10 block types (hero, product_grid, text, banner, image, spacer, divider, testimonial, two_column, category_grid), inline editors, reorder, live preview
- PageRenderer: all block types with kiosk dark theme, scroll-triggered animations, product cards with 3:4 ratio and hover lift
- Kiosk shell: sticky navbar with logo/links/cart, slug routing, loading/error states
- Cart drawer: 3-step payment flow (cart → payment → confirmation), quantity controls, card formatting, simulation mode badge
- Settings panel: branding, colors, tax, USAePay config, change password
- Orders panel: revenue stats cards, expandable order list, status badges
- Backend tests: 38 pytest tests covering all routes and edge cases
- Frontend tests: RTL + Jest test stubs for cart, login, PageRenderer, Navbar
- Deploy script: Proxmox LXC provisioning with Node 20, Python, Nginx, systemd
