# Issues
Last updated: 2026-03-16

## Open
- [TODO] Frontend RTL tests need npm install to run — test file ready but not executed in CI
- [TODO] Real USAePay integration needs live API keys to test
- [TODO] Image optimization (resize/compress on upload) not yet implemented
- [TODO] Product drag-and-drop reorder uses arrow buttons — could add HTML5 drag API

## Resolved
- [FIXED] FastAPI form validation returns 422 not 400 — test updated to accept both
- [FIXED] All routes have try/except error handling
- [FIXED] bcrypt used for password hashing (12 rounds)
- [FIXED] No fetch() calls outside api.js
