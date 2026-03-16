"""
Site Builder Platform — Backend API
FastAPI application with SQLite, bcrypt auth, and USAePay integration.
"""

import base64
import io
import json
import os
import secrets
import shutil
import sqlite3
import time
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import bcrypt
import httpx
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# ─── Paths ───────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = BASE_DIR / "uploads"
DB_PATH = DATA_DIR / "kiosk.db"

DATA_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="Site Builder API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# ─── Rate limiting store (in-memory) ────────────────────────────────────────

login_attempts: dict[str, list[float]] = {}

# ─── Database ────────────────────────────────────────────────────────────────


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            price REAL NOT NULL,
            image TEXT DEFAULT '',
            category TEXT DEFAULT 'General',
            in_stock INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            variants TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            layout TEXT DEFAULT '[]',
            is_home INTEGER DEFAULT 0,
            published INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            admin_id INTEGER NOT NULL,
            expires_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            items TEXT NOT NULL,
            subtotal REAL NOT NULL,
            tax REAL NOT NULL,
            total REAL NOT NULL,
            payment_ref TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)

    # Seed only if empty
    admin_count = cur.execute("SELECT COUNT(*) FROM admins").fetchone()[0]
    if admin_count == 0:
        _seed_data(cur)

    conn.commit()
    conn.close()


def _seed_data(cur: sqlite3.Cursor):
    # Admin user: admin / admin123
    pw_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt(rounds=12)).decode()
    cur.execute(
        "INSERT INTO admins (username, password_hash) VALUES (?, ?)",
        ("admin", pw_hash),
    )

    # Sample products
    products = [
        ("Velvet Matte Lipstick", "Long-wearing matte finish in a universally flattering rose shade. Enriched with vitamin E for all-day comfort.", 24.00, "Lips", 1),
        ("Hydra Gloss Lip Oil", "Sheer, glossy color with nourishing jojoba and rosehip oils. Buildable coverage that never feels sticky.", 18.00, "Lips", 2),
        ("Precision Lip Liner", "Creamy, transfer-proof formula that defines and shapes. Pairs perfectly with any lip color.", 14.00, "Lips", 3),
        ("Smoky Eye Palette", "Six richly pigmented shades from champagne to midnight. Buttery-soft formula blends effortlessly.", 38.00, "Eyes", 4),
        ("Volumizing Mascara", "Dramatic volume and length without clumping. Buildable formula with a curved precision brush.", 22.00, "Eyes", 5),
        ("Luminous Skin Tint", "Lightweight, buildable coverage with a natural radiant finish. SPF 30 protection with skincare benefits.", 32.00, "Face", 6),
    ]
    for name, desc, price, cat, sort in products:
        cur.execute(
            "INSERT INTO products (name, description, price, category, sort_order) VALUES (?, ?, ?, ?, ?)",
            (name, desc, price, cat, sort),
        )

    # Home page with hero + product grid
    home_layout = json.dumps([
        {
            "id": f"block_{uuid.uuid4().hex[:8]}",
            "type": "hero",
            "props": {
                "title": "Beauty, Redefined",
                "subtitle": "Discover our curated collection of premium cosmetics crafted for every skin tone and style.",
                "cta": "Shop Now",
                "badge": "New Collection",
                "bg_color": "#0d0d0d",
            },
        },
        {
            "id": f"block_{uuid.uuid4().hex[:8]}",
            "type": "product_grid",
            "props": {
                "title": "Bestsellers",
                "category": "all",
                "limit": 6,
                "columns": 3,
            },
        },
    ])
    cur.execute(
        "INSERT INTO pages (slug, title, layout, is_home, published) VALUES (?, ?, ?, ?, ?)",
        ("home", "Home", home_layout, 1, 1),
    )

    # Default settings
    defaults = {
        "site_name": "Luxe Beauty",
        "logo_text": "LUXE",
        "tax_rate": "8.25",
        "primary_color": "#C2185B",
        "accent_color": "#C2185B",
        "bg_color": "#0d0d0d",
        "surface_color": "#141414",
        "card_color": "#1c1c1c",
        "text_color": "#f5f0eb",
        "usaepay_key": "",
        "usaepay_pin": "",
        "usaepay_sandbox": "1",
        "timezone": "America/New_York",
    }
    for k, v in defaults.items():
        cur.execute(
            "INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)", (k, v)
        )


# ─── Auth helpers ────────────────────────────────────────────────────────────


def verify_token(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")

    token = authorization.replace("Bearer ", "")
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT admin_id, expires_at FROM sessions WHERE token = ?", (token,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid session token")
        if row["expires_at"] < time.time():
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            raise HTTPException(status_code=401, detail="Session expired")
        return row["admin_id"]
    finally:
        conn.close()


def check_rate_limit(ip: str):
    now = time.time()
    window = 600  # 10 minutes
    max_attempts = 5

    if ip in login_attempts:
        login_attempts[ip] = [t for t in login_attempts[ip] if now - t < window]
        if len(login_attempts[ip]) >= max_attempts:
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Please try again in 10 minutes.",
            )


def record_login_attempt(ip: str):
    if ip not in login_attempts:
        login_attempts[ip] = []
    login_attempts[ip].append(time.time())


# ─── Startup ─────────────────────────────────────────────────────────────────


@app.on_event("startup")
async def startup():
    init_db()


# ─── Health ──────────────────────────────────────────────────────────────────


@app.get("/api/health")
async def health():
    return {"ok": True, "version": "0.1.0"}


# ─── Auth Routes ─────────────────────────────────────────────────────────────


@app.post("/api/auth/login")
async def login(request: Request):
    try:
        body = await request.json()
        username = body.get("username", "").strip()
        password = body.get("password", "")

        if not username or not password:
            raise HTTPException(status_code=400, detail="Username and password are required")

        ip = request.client.host if request.client else "unknown"
        check_rate_limit(ip)

        conn = get_db()
        try:
            admin = conn.execute(
                "SELECT id, password_hash FROM admins WHERE username = ?", (username,)
            ).fetchone()

            if not admin or not bcrypt.checkpw(
                password.encode(), admin["password_hash"].encode()
            ):
                record_login_attempt(ip)
                raise HTTPException(status_code=401, detail="Invalid credentials")

            # Clear expired sessions
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))

            token = secrets.token_hex(32)
            expires = time.time() + 7 * 24 * 3600  # 7 days
            conn.execute(
                "INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)",
                (token, admin["id"], expires),
            )
            conn.commit()

            return {"token": token, "username": username}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Login failed")


@app.post("/api/auth/logout")
async def logout(
    authorization: Optional[str] = Header(None),
    admin_id: int = Depends(verify_token),
):
    token = authorization.replace("Bearer ", "") if authorization else ""
    conn = get_db()
    try:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.post("/api/auth/change-password")
async def change_password(request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        password = body.get("password", "")

        if len(password) < 6:
            raise HTTPException(
                status_code=400, detail="Password must be at least 6 characters"
            )

        pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
        conn = get_db()
        try:
            conn.execute(
                "UPDATE admins SET password_hash = ? WHERE id = ?", (pw_hash, admin_id)
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to change password")


# ─── Products Routes ────────────────────────────────────────────────────────


@app.get("/api/products")
async def get_products(category: Optional[str] = None):
    try:
        conn = get_db()
        try:
            if category and category != "all":
                rows = conn.execute(
                    "SELECT * FROM products WHERE in_stock = 1 AND category = ? ORDER BY sort_order",
                    (category,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM products WHERE in_stock = 1 ORDER BY sort_order"
                ).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                d["variants"] = json.loads(d.get("variants") or "[]")
                results.append(d)
            return results
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch products")


@app.get("/api/products/all")
async def get_all_products(admin_id: int = Depends(verify_token)):
    try:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT * FROM products ORDER BY sort_order"
            ).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                d["variants"] = json.loads(d.get("variants") or "[]")
                results.append(d)
            return results
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch products")


@app.get("/api/products/categories")
async def get_categories():
    try:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT DISTINCT category FROM products WHERE in_stock = 1 ORDER BY category"
            ).fetchall()
            return [r["category"] for r in rows]
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


@app.get("/api/products/{product_id}")
async def get_product(product_id: int):
    try:
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT * FROM products WHERE id = ?", (product_id,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Product not found")
            result = dict(row)
            result["variants"] = json.loads(result.get("variants") or "[]")
            return result
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch product")


@app.post("/api/products")
async def create_product(
    name: str = Form(...),
    price: float = Form(...),
    description: str = Form(""),
    category: str = Form("General"),
    in_stock: int = Form(1),
    sort_order: int = Form(0),
    variants: str = Form("[]"),
    image: Optional[UploadFile] = File(None),
    admin_id: int = Depends(verify_token),
):
    try:
        if not name.strip():
            raise HTTPException(status_code=400, detail="Product name is required")
        if price <= 0:
            raise HTTPException(status_code=400, detail="Price must be greater than 0")

        image_path = ""
        if image and image.filename:
            image_path = await _save_upload(image)

        conn = get_db()
        try:
            cur = conn.execute(
                "INSERT INTO products (name, description, price, image, category, in_stock, sort_order, variants) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (name.strip(), description, price, image_path, category, in_stock, sort_order, variants),
            )
            conn.commit()
            product = conn.execute(
                "SELECT * FROM products WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
            result = dict(product)
            result["variants"] = json.loads(result.get("variants") or "[]")
            return result
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create product")


@app.put("/api/products/{product_id}")
async def update_product(
    product_id: int,
    name: str = Form(...),
    price: float = Form(...),
    description: str = Form(""),
    category: str = Form("General"),
    in_stock: int = Form(1),
    sort_order: int = Form(0),
    variants: str = Form("[]"),
    image: Optional[UploadFile] = File(None),
    admin_id: int = Depends(verify_token),
):
    try:
        if not name.strip():
            raise HTTPException(status_code=400, detail="Product name is required")
        if price <= 0:
            raise HTTPException(status_code=400, detail="Price must be greater than 0")

        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT * FROM products WHERE id = ?", (product_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Product not found")

            image_path = existing["image"]
            if image and image.filename:
                image_path = await _save_upload(image)

            conn.execute(
                "UPDATE products SET name=?, description=?, price=?, image=?, category=?, in_stock=?, sort_order=?, variants=? WHERE id=?",
                (name.strip(), description, price, image_path, category, in_stock, sort_order, variants, product_id),
            )
            conn.commit()
            product = conn.execute(
                "SELECT * FROM products WHERE id = ?", (product_id,)
            ).fetchone()
            result = dict(product)
            result["variants"] = json.loads(result.get("variants") or "[]")
            return result
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update product")


@app.delete("/api/products/{product_id}")
async def delete_product(product_id: int, admin_id: int = Depends(verify_token)):
    try:
        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT id FROM products WHERE id = ?", (product_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Product not found")
            conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete product")


@app.patch("/api/products/reorder")
async def reorder_products(request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        ids = body.get("ids", [])
        if not ids:
            raise HTTPException(status_code=400, detail="No product IDs provided")

        conn = get_db()
        try:
            for i, pid in enumerate(ids):
                conn.execute(
                    "UPDATE products SET sort_order = ? WHERE id = ?", (i, pid)
                )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to reorder products")


# ─── Pages Routes ───────────────────────────────────────────────────────────


@app.get("/api/pages")
async def get_pages():
    try:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT id, slug, title, is_home, published FROM pages ORDER BY is_home DESC, title"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch pages")


@app.get("/api/pages/{slug}")
async def get_page(slug: str):
    try:
        conn = get_db()
        try:
            page = conn.execute(
                "SELECT * FROM pages WHERE slug = ?", (slug,)
            ).fetchone()
            if not page:
                raise HTTPException(status_code=404, detail="Page not found")
            result = dict(page)
            result["layout"] = json.loads(result["layout"])
            return result
        finally:
            conn.close()
    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid page layout data")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch page")


@app.post("/api/pages")
async def create_page(request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        slug = body.get("slug", "").strip().lower()
        title = body.get("title", "").strip()

        if not slug or not title:
            raise HTTPException(status_code=400, detail="Slug and title are required")

        # Validate slug format
        import re
        if not re.match(r'^[a-z0-9][a-z0-9-]*$', slug):
            raise HTTPException(
                status_code=400,
                detail="Slug must contain only lowercase letters, numbers, and hyphens",
            )

        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT id FROM pages WHERE slug = ?", (slug,)
            ).fetchone()
            if existing:
                raise HTTPException(status_code=400, detail="A page with this slug already exists")

            cur = conn.execute(
                "INSERT INTO pages (slug, title, layout) VALUES (?, ?, '[]')",
                (slug, title),
            )
            conn.commit()
            page = conn.execute(
                "SELECT * FROM pages WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
            result = dict(page)
            result["layout"] = json.loads(result["layout"])
            return result
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create page")


@app.put("/api/pages/{page_id}")
async def update_page(
    page_id: int, request: Request, admin_id: int = Depends(verify_token)
):
    try:
        body = await request.json()
        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT * FROM pages WHERE id = ?", (page_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Page not found")

            title = body.get("title", existing["title"])
            layout = body.get("layout", json.loads(existing["layout"]))
            published = body.get("published", existing["published"])

            conn.execute(
                "UPDATE pages SET title=?, layout=?, published=? WHERE id=?",
                (title, json.dumps(layout), published, page_id),
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update page")


@app.delete("/api/pages/{page_id}")
async def delete_page(page_id: int, admin_id: int = Depends(verify_token)):
    try:
        conn = get_db()
        try:
            page = conn.execute(
                "SELECT * FROM pages WHERE id = ?", (page_id,)
            ).fetchone()
            if not page:
                raise HTTPException(status_code=404, detail="Page not found")
            if page["is_home"]:
                raise HTTPException(
                    status_code=400, detail="Cannot delete the home page"
                )
            conn.execute("DELETE FROM pages WHERE id = ?", (page_id,))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete page")


# ─── Settings Routes ────────────────────────────────────────────────────────

SAFE_SETTINGS = [
    "site_name", "logo_text", "tax_rate", "primary_color", "accent_color",
    "bg_color", "bg_image", "surface_color", "card_color", "text_color", "timezone"
]
ALL_SETTINGS = SAFE_SETTINGS + ["usaepay_key", "usaepay_pin", "usaepay_sandbox"]


@app.get("/api/settings")
async def get_settings():
    try:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT key, value FROM site_settings WHERE key IN ({})".format(
                    ",".join("?" * len(SAFE_SETTINGS))
                ),
                SAFE_SETTINGS,
            ).fetchall()
            return {r["key"]: r["value"] for r in rows}
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch settings")


@app.get("/api/settings/admin")
async def get_admin_settings(admin_id: int = Depends(verify_token)):
    try:
        conn = get_db()
        try:
            rows = conn.execute("SELECT key, value FROM site_settings").fetchall()
            return {r["key"]: r["value"] for r in rows}
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch settings")


@app.put("/api/settings")
async def update_settings(request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        conn = get_db()
        try:
            for key, value in body.items():
                if key in ALL_SETTINGS:
                    conn.execute(
                        "INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)",
                        (key, str(value)),
                    )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update settings")


# ─── Checkout & Orders ──────────────────────────────────────────────────────


@app.post("/api/checkout")
async def checkout(request: Request):
    try:
        body = await request.json()
        items = body.get("items", [])
        card_number = body.get("card_number", "")
        card_exp = body.get("card_exp", "")
        card_cvv = body.get("card_cvv", "")
        card_name = body.get("card_name", "")

        if not items:
            raise HTTPException(status_code=400, detail="Cart is empty")
        if not card_number or not card_exp or not card_cvv or not card_name:
            raise HTTPException(status_code=400, detail="All card fields are required")

        # Calculate totals
        subtotal = sum(item["price"] * item["qty"] for item in items)

        conn = get_db()
        try:
            tax_rate_row = conn.execute(
                "SELECT value FROM site_settings WHERE key = 'tax_rate'"
            ).fetchone()
            tax_rate = float(tax_rate_row["value"]) if tax_rate_row else 8.25
        finally:
            conn.close()

        tax = round(subtotal * tax_rate / 100, 2)
        total = round(subtotal + tax, 2)

        # Check for USAePay keys
        conn = get_db()
        try:
            key_row = conn.execute(
                "SELECT value FROM site_settings WHERE key = 'usaepay_key'"
            ).fetchone()
            usaepay_key = key_row["value"] if key_row else ""
        finally:
            conn.close()

        simulated = False
        payment_ref = ""
        status = "pending"

        if not usaepay_key:
            # Simulation mode
            simulated = True
            payment_ref = f"SIM-{secrets.token_hex(4).upper()}"
            status = "approved"
        else:
            # Real USAePay call
            conn = get_db()
            try:
                pin_row = conn.execute(
                    "SELECT value FROM site_settings WHERE key = 'usaepay_pin'"
                ).fetchone()
                sandbox_row = conn.execute(
                    "SELECT value FROM site_settings WHERE key = 'usaepay_sandbox'"
                ).fetchone()
                pin = pin_row["value"] if pin_row else ""
                sandbox = sandbox_row["value"] if sandbox_row else "1"
            finally:
                conn.close()

            base_url = (
                "https://sandbox.usaepay.com/api/v2/transactions"
                if sandbox == "1"
                else "https://secure.usaepay.com/api/v2/transactions"
            )

            payload = {
                "command": "cc:sale",
                "amount": total,
                "creditcard": {
                    "number": card_number,
                    "expiration": card_exp,
                    "cvv2": card_cvv,
                    "cardholder": card_name,
                },
            }

            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        base_url,
                        json=payload,
                        auth=(usaepay_key, pin),
                        timeout=30,
                    )
                    data = resp.json()
                    if data.get("result") == "Approved":
                        payment_ref = data.get("refnum", "")
                        status = "approved"
                    else:
                        status = "declined"
                        payment_ref = data.get("error", "Payment declined")
            except Exception:
                raise HTTPException(
                    status_code=502, detail="Payment processor unavailable"
                )

        # Record order (mask card number — only last 4)
        order_items = [
            {"id": i["id"], "name": i["name"], "price": i["price"], "qty": i["qty"]}
            for i in items
        ]

        conn = get_db()
        try:
            conn.execute(
                "INSERT INTO orders (items, subtotal, tax, total, payment_ref, status) VALUES (?, ?, ?, ?, ?, ?)",
                (json.dumps(order_items), subtotal, tax, total, payment_ref, status),
            )
            conn.commit()
        finally:
            conn.close()

        return {
            "success": status == "approved",
            "ref": payment_ref,
            "total": total,
            "subtotal": subtotal,
            "tax": tax,
            "simulated": simulated,
            "status": status,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Checkout failed")


@app.get("/api/orders")
async def get_orders(admin_id: int = Depends(verify_token)):
    try:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT * FROM orders ORDER BY created_at DESC"
            ).fetchall()
            orders = []
            for r in rows:
                o = dict(r)
                o["items"] = json.loads(o["items"])
                orders.append(o)
            return orders
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch orders")


@app.get("/api/orders/stats")
async def get_order_stats(admin_id: int = Depends(verify_token)):
    try:
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT COALESCE(SUM(total), 0) as total_revenue, COUNT(*) as order_count, COALESCE(AVG(total), 0) as avg_order FROM orders WHERE status = 'approved'"
            ).fetchone()
            return {
                "total_revenue": round(row["total_revenue"], 2),
                "order_count": row["order_count"],
                "avg_order": round(row["avg_order"], 2),
            }
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch order stats")


# ─── File Upload ─────────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


async def _save_upload(file: UploadFile) -> str:
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Accepted: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 10MB.")

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = UPLOADS_DIR / filename
    filepath.write_bytes(content)
    return f"/uploads/{filename}"


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...), admin_id: int = Depends(verify_token)
):
    try:
        url = await _save_upload(file)
        return {"url": url}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Upload failed")


# ─── Backup & Restore ────────────────────────────────────────────────────────


@app.get("/api/backup/export")
async def export_backup(admin_id: int = Depends(verify_token)):
    """Export complete system backup as a ZIP file (base64 encoded)."""
    try:
        conn = get_db()
        try:
            backup_data = {
                "version": "1.0",
                "exported_at": datetime.utcnow().isoformat(),
                "tables": {}
            }

            # Export products
            products = conn.execute("SELECT * FROM products").fetchall()
            backup_data["tables"]["products"] = [dict(r) for r in products]

            # Export pages
            pages = conn.execute("SELECT * FROM pages").fetchall()
            backup_data["tables"]["pages"] = [dict(r) for r in pages]

            # Export settings
            settings = conn.execute("SELECT * FROM site_settings").fetchall()
            backup_data["tables"]["site_settings"] = [dict(r) for r in settings]

            # Export orders
            orders = conn.execute("SELECT * FROM orders").fetchall()
            backup_data["tables"]["orders"] = [dict(r) for r in orders]

            # Note: We don't export admins/sessions for security
            # The restore will keep existing admin credentials

        finally:
            conn.close()

        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add database JSON
            zf.writestr("database.json", json.dumps(backup_data, indent=2))

            # Add uploaded files
            if UPLOADS_DIR.exists():
                for file_path in UPLOADS_DIR.iterdir():
                    if file_path.is_file():
                        zf.write(file_path, f"uploads/{file_path.name}")

        zip_buffer.seek(0)
        zip_base64 = base64.b64encode(zip_buffer.read()).decode('utf-8')

        return {
            "filename": f"backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip",
            "data": zip_base64,
            "size": len(zip_base64),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")


@app.post("/api/backup/import")
async def import_backup(
    file: UploadFile = File(...),
    admin_id: int = Depends(verify_token)
):
    """Import system backup from a ZIP file."""
    try:
        # Read uploaded file
        content = await file.read()

        if not file.filename or not file.filename.endswith('.zip'):
            raise HTTPException(status_code=400, detail="File must be a ZIP archive")

        # Open ZIP
        try:
            zip_buffer = io.BytesIO(content)
            with zipfile.ZipFile(zip_buffer, 'r') as zf:
                # Check for database.json
                if "database.json" not in zf.namelist():
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid backup: database.json not found"
                    )

                # Parse database JSON
                db_json = zf.read("database.json").decode('utf-8')
                backup_data = json.loads(db_json)

                if "version" not in backup_data or "tables" not in backup_data:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid backup format"
                    )

                conn = get_db()
                try:
                    # Clear existing data (except admins/sessions)
                    conn.execute("DELETE FROM products")
                    conn.execute("DELETE FROM pages")
                    conn.execute("DELETE FROM site_settings")
                    conn.execute("DELETE FROM orders")

                    # Restore products
                    for p in backup_data["tables"].get("products", []):
                        conn.execute(
                            """INSERT INTO products
                               (id, name, description, price, image, category, in_stock, sort_order, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (p.get("id"), p.get("name"), p.get("description", ""),
                             p.get("price"), p.get("image", ""), p.get("category", "General"),
                             p.get("in_stock", 1), p.get("sort_order", 0), p.get("created_at"))
                        )

                    # Restore pages
                    for p in backup_data["tables"].get("pages", []):
                        layout = p.get("layout", "[]")
                        if isinstance(layout, list):
                            layout = json.dumps(layout)
                        conn.execute(
                            """INSERT INTO pages
                               (id, slug, title, layout, is_home, published, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (p.get("id"), p.get("slug"), p.get("title"),
                             layout, p.get("is_home", 0), p.get("published", 1), p.get("created_at"))
                        )

                    # Restore settings
                    for s in backup_data["tables"].get("site_settings", []):
                        conn.execute(
                            "INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)",
                            (s.get("key"), s.get("value"))
                        )

                    # Restore orders
                    for o in backup_data["tables"].get("orders", []):
                        items = o.get("items", "[]")
                        if isinstance(items, list):
                            items = json.dumps(items)
                        conn.execute(
                            """INSERT INTO orders
                               (id, items, subtotal, tax, total, payment_ref, status, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                            (o.get("id"), items, o.get("subtotal"),
                             o.get("tax"), o.get("total"), o.get("payment_ref", ""),
                             o.get("status", "pending"), o.get("created_at"))
                        )

                    conn.commit()
                finally:
                    conn.close()

                # Clear existing uploads and restore from backup
                if UPLOADS_DIR.exists():
                    shutil.rmtree(UPLOADS_DIR)
                UPLOADS_DIR.mkdir(exist_ok=True)

                # Extract uploaded files
                for name in zf.namelist():
                    if name.startswith("uploads/") and not name.endswith("/"):
                        file_name = name.replace("uploads/", "")
                        file_content = zf.read(name)
                        (UPLOADS_DIR / file_name).write_bytes(file_content)

        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid ZIP file")

        return {
            "ok": True,
            "message": "Backup restored successfully",
            "restored": {
                "products": len(backup_data["tables"].get("products", [])),
                "pages": len(backup_data["tables"].get("pages", [])),
                "settings": len(backup_data["tables"].get("site_settings", [])),
                "orders": len(backup_data["tables"].get("orders", [])),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")
