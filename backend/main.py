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
            category_id INTEGER DEFAULT NULL,
            stock_qty INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            variants TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
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
            card_last4 TEXT DEFAULT NULL,
            payment_method TEXT DEFAULT 'card',
            card_amount REAL DEFAULT 0,
            cash_amount REAL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- Hierarchical categories
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            parent_id INTEGER DEFAULT NULL,
            sort_order INTEGER DEFAULT 0,
            image TEXT DEFAULT '',
            FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
        );

        -- Skin concerns master list
        CREATE TABLE IF NOT EXISTS skin_concerns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            sort_order INTEGER DEFAULT 0
        );

        -- Product-to-concerns many-to-many
        CREATE TABLE IF NOT EXISTS product_skin_concerns (
            product_id INTEGER NOT NULL,
            skin_concern_id INTEGER NOT NULL,
            PRIMARY KEY (product_id, skin_concern_id),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (skin_concern_id) REFERENCES skin_concerns(id) ON DELETE CASCADE
        );
    """)

    # Migration: rename in_stock to stock_qty if old column exists
    try:
        cols = [row[1] for row in cur.execute("PRAGMA table_info(products)").fetchall()]
        if "in_stock" in cols and "stock_qty" not in cols:
            cur.execute("ALTER TABLE products RENAME COLUMN in_stock TO stock_qty")
            # Convert boolean to quantity (1 -> 10, 0 -> 0)
            cur.execute("UPDATE products SET stock_qty = CASE WHEN stock_qty = 1 THEN 10 ELSE 0 END")
        elif "stock_qty" not in cols:
            cur.execute("ALTER TABLE products ADD COLUMN stock_qty INTEGER DEFAULT 0")
    except Exception:
        pass

    # Migration: add order payment columns if missing
    try:
        cols = [row[1] for row in cur.execute("PRAGMA table_info(orders)").fetchall()]
        if "card_last4" not in cols:
            cur.execute("ALTER TABLE orders ADD COLUMN card_last4 TEXT DEFAULT NULL")
        if "payment_method" not in cols:
            cur.execute("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'card'")
        if "card_amount" not in cols:
            cur.execute("ALTER TABLE orders ADD COLUMN card_amount REAL DEFAULT 0")
        if "cash_amount" not in cols:
            cur.execute("ALTER TABLE orders ADD COLUMN cash_amount REAL DEFAULT 0")
    except Exception:
        pass

    # Migration: add category_id to products if missing
    try:
        cols = [row[1] for row in cur.execute("PRAGMA table_info(products)").fetchall()]
        if "category_id" not in cols:
            cur.execute("ALTER TABLE products ADD COLUMN category_id INTEGER DEFAULT NULL")
    except Exception:
        pass

    # Seed default skin concerns if empty
    try:
        concern_count = cur.execute("SELECT COUNT(*) FROM skin_concerns").fetchone()[0]
        if concern_count == 0:
            default_concerns = [
                ("Wrinkles", "wrinkles", 1),
                ("Dry Skin", "dry-skin", 2),
                ("Oily Skin", "oily-skin", 3),
                ("Acne-Prone", "acne-prone", 4),
                ("Sensitive", "sensitive", 5),
                ("Anti-aging", "anti-aging", 6),
            ]
            for name, slug, sort in default_concerns:
                cur.execute(
                    "INSERT INTO skin_concerns (name, slug, sort_order) VALUES (?, ?, ?)",
                    (name, slug, sort)
                )
    except Exception:
        pass

    # Migration: populate categories from existing product.category values
    try:
        cat_count = cur.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if cat_count == 0:
            # Get distinct categories from products
            existing_cats = cur.execute(
                "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''"
            ).fetchall()
            for i, (cat_name,) in enumerate(existing_cats):
                slug = cat_name.lower().replace(" ", "-").replace("'", "")
                cur.execute(
                    "INSERT OR IGNORE INTO categories (name, slug, sort_order) VALUES (?, ?, ?)",
                    (cat_name, slug, i)
                )
            # Update products with category_id
            cur.execute("""
                UPDATE products SET category_id = (
                    SELECT id FROM categories WHERE categories.name = products.category
                ) WHERE category_id IS NULL AND category IS NOT NULL AND category != ''
            """)
    except Exception:
        pass

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

    # Sample products with stock quantities
    products = [
        ("Velvet Matte Lipstick", "Long-wearing matte finish in a universally flattering rose shade. Enriched with vitamin E for all-day comfort.", 24.00, "Lips", 1, 15),
        ("Hydra Gloss Lip Oil", "Sheer, glossy color with nourishing jojoba and rosehip oils. Buildable coverage that never feels sticky.", 18.00, "Lips", 2, 20),
        ("Precision Lip Liner", "Creamy, transfer-proof formula that defines and shapes. Pairs perfectly with any lip color.", 14.00, "Lips", 3, 25),
        ("Smoky Eye Palette", "Six richly pigmented shades from champagne to midnight. Buttery-soft formula blends effortlessly.", 38.00, "Eyes", 4, 8),
        ("Volumizing Mascara", "Dramatic volume and length without clumping. Buildable formula with a curved precision brush.", 22.00, "Eyes", 5, 30),
        ("Luminous Skin Tint", "Lightweight, buildable coverage with a natural radiant finish. SPF 30 protection with skincare benefits.", 32.00, "Face", 6, 12),
    ]
    for name, desc, price, cat, sort, stock in products:
        cur.execute(
            "INSERT INTO products (name, description, price, category, stock_qty, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
            (name, desc, price, cat, stock, sort),
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
        "low_stock_threshold": "5",
        "screen_timeout": "120",
        "screen_timeout_warning": "30",
        "cash_payment_message": "Collect ${amount} in cash from customer.",
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


def _has_stock(product_row) -> bool:
    """Check if a product has any stock (either main stock or variant stock)."""
    variants = json.loads(product_row["variants"] or "[]")
    if variants:
        # Product has variants - check if ANY variant has stock
        return any(v.get("stock_qty", 0) > 0 for v in variants)
    else:
        # No variants - check main stock_qty
        return product_row["stock_qty"] > 0


def _get_total_stock(product_row) -> int:
    """Get total available stock for a product (sum of variants or main stock)."""
    variants = json.loads(product_row["variants"] or "[]")
    if variants:
        return sum(v.get("stock_qty", 0) for v in variants)
    else:
        return product_row["stock_qty"]


@app.get("/api/products")
async def get_products(
    category: Optional[str] = None,
    category_id: Optional[int] = None,
    include_subcategories: bool = False,
    skin_concerns: Optional[str] = None,
    search: Optional[str] = None,
):
    try:
        conn = get_db()
        try:
            # Get low stock threshold
            threshold_row = conn.execute(
                "SELECT value FROM site_settings WHERE key = 'low_stock_threshold'"
            ).fetchone()
            low_stock_threshold = int(threshold_row["value"]) if threshold_row else 5

            # Build query
            query = "SELECT DISTINCT p.* FROM products p"
            conditions = []
            params = []

            # Join for skin concerns filtering
            if skin_concerns:
                query += " INNER JOIN product_skin_concerns psc ON p.id = psc.product_id"
                concern_ids = [int(x) for x in skin_concerns.split(",") if x.strip()]
                if concern_ids:
                    placeholders = ",".join("?" * len(concern_ids))
                    conditions.append(f"psc.skin_concern_id IN ({placeholders})")
                    params.extend(concern_ids)

            # Category filtering - by text or by id
            if category and category != "all":
                conditions.append("p.category = ?")
                params.append(category)
            elif category_id:
                if include_subcategories:
                    # Get all child category ids recursively
                    category_ids = _get_category_tree_ids(conn, category_id)
                    placeholders = ",".join("?" * len(category_ids))
                    conditions.append(f"p.category_id IN ({placeholders})")
                    params.extend(category_ids)
                else:
                    conditions.append("p.category_id = ?")
                    params.append(category_id)

            # Search filtering
            if search:
                search_term = f"%{search}%"
                conditions.append("(p.name LIKE ? OR p.description LIKE ?)")
                params.extend([search_term, search_term])

            if conditions:
                query += " WHERE " + " AND ".join(conditions)

            query += " ORDER BY p.sort_order"

            rows = conn.execute(query, params).fetchall()

            results = []
            for r in rows:
                d = dict(r)
                d["variants"] = json.loads(d.get("variants") or "[]")
                d["low_stock_threshold"] = low_stock_threshold
                d["total_stock"] = _get_total_stock(r)
                # Get skin concerns for product
                concerns = conn.execute(
                    "SELECT sc.id, sc.name, sc.slug FROM skin_concerns sc "
                    "INNER JOIN product_skin_concerns psc ON sc.id = psc.skin_concern_id "
                    "WHERE psc.product_id = ? ORDER BY sc.sort_order",
                    (d["id"],)
                ).fetchall()
                d["skin_concerns"] = [dict(c) for c in concerns]
                results.append(d)
            return results
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch products")


def _get_category_tree_ids(conn, parent_id: int) -> list:
    """Get all category IDs including the parent and all descendants."""
    result = [parent_id]
    children = conn.execute(
        "SELECT id FROM categories WHERE parent_id = ?", (parent_id,)
    ).fetchall()
    for child in children:
        result.extend(_get_category_tree_ids(conn, child["id"]))
    return result


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
                # Fetch skin concerns for this product
                concerns = conn.execute(
                    """SELECT sc.id, sc.name, sc.slug FROM skin_concerns sc
                       JOIN product_skin_concerns psc ON sc.id = psc.skin_concern_id
                       WHERE psc.product_id = ?""",
                    (r["id"],)
                ).fetchall()
                d["skin_concerns"] = [dict(c) for c in concerns]
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
            # Get all categories (including those with only out-of-stock products)
            rows = conn.execute(
                "SELECT DISTINCT category FROM products ORDER BY category"
            ).fetchall()
            return [r["category"] for r in rows]
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


@app.get("/api/products/search")
async def search_products(q: str = ""):
    """Search products by name and description."""
    try:
        if not q or len(q) < 2:
            return []

        conn = get_db()
        try:
            search_term = f"%{q}%"
            rows = conn.execute(
                "SELECT * FROM products WHERE name LIKE ? OR description LIKE ? ORDER BY sort_order LIMIT 20",
                (search_term, search_term),
            ).fetchall()

            results = []
            for r in rows:
                d = dict(r)
                d["variants"] = json.loads(d.get("variants") or "[]")
                d["total_stock"] = _get_total_stock(r)
                results.append(d)
            return results
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Search failed")


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

            # Get low stock threshold
            threshold_row = conn.execute(
                "SELECT value FROM site_settings WHERE key = 'low_stock_threshold'"
            ).fetchone()
            low_stock_threshold = int(threshold_row["value"]) if threshold_row else 5

            result = dict(row)
            result["variants"] = json.loads(result.get("variants") or "[]")
            result["low_stock_threshold"] = low_stock_threshold

            # Get skin concerns for product
            concerns = conn.execute(
                "SELECT sc.id, sc.name, sc.slug FROM skin_concerns sc "
                "INNER JOIN product_skin_concerns psc ON sc.id = psc.skin_concern_id "
                "WHERE psc.product_id = ? ORDER BY sc.sort_order",
                (product_id,)
            ).fetchall()
            result["skin_concerns"] = [dict(c) for c in concerns]

            # Get category info if category_id exists
            if result.get("category_id"):
                cat_row = conn.execute(
                    "SELECT * FROM categories WHERE id = ?", (result["category_id"],)
                ).fetchone()
                if cat_row:
                    result["category_info"] = dict(cat_row)
                    # Get parent category if exists
                    if cat_row["parent_id"]:
                        parent_row = conn.execute(
                            "SELECT * FROM categories WHERE id = ?", (cat_row["parent_id"],)
                        ).fetchone()
                        if parent_row:
                            result["parent_category_info"] = dict(parent_row)

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
    category_id: Optional[int] = Form(None),
    stock_qty: int = Form(0),
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
                "INSERT INTO products (name, description, price, image, category, category_id, stock_qty, sort_order, variants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (name.strip(), description, price, image_path, category, category_id, stock_qty, sort_order, variants),
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
    category_id: Optional[int] = Form(None),
    stock_qty: int = Form(0),
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
                "UPDATE products SET name=?, description=?, price=?, image=?, category=?, category_id=?, stock_qty=?, sort_order=?, variants=? WHERE id=?",
                (name.strip(), description, price, image_path, category, category_id, stock_qty, sort_order, variants, product_id),
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


# ─── Categories Routes ──────────────────────────────────────────────────────


def _slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    import re
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


@app.get("/api/categories")
async def get_categories_list():
    """Get flat list of all categories."""
    try:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT * FROM categories ORDER BY sort_order, name"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


@app.get("/api/categories/tree")
async def get_categories_tree():
    """Get hierarchical category tree."""
    try:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT * FROM categories ORDER BY sort_order, name"
            ).fetchall()
            categories = [dict(r) for r in rows]

            # Build tree structure
            by_id = {c["id"]: {**c, "children": []} for c in categories}
            root = []
            for cat in categories:
                if cat["parent_id"] and cat["parent_id"] in by_id:
                    by_id[cat["parent_id"]]["children"].append(by_id[cat["id"]])
                else:
                    root.append(by_id[cat["id"]])
            return root
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch category tree")


@app.post("/api/categories")
async def create_category(request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        name = body.get("name", "").strip()
        parent_id = body.get("parent_id")
        image = body.get("image", "")
        sort_order = body.get("sort_order", 0)

        if not name:
            raise HTTPException(status_code=400, detail="Category name is required")

        slug = _slugify(name)

        conn = get_db()
        try:
            # Check for duplicate slug
            existing = conn.execute(
                "SELECT id FROM categories WHERE slug = ?", (slug,)
            ).fetchone()
            if existing:
                # Add number suffix
                base_slug = slug
                counter = 2
                while existing:
                    slug = f"{base_slug}-{counter}"
                    existing = conn.execute(
                        "SELECT id FROM categories WHERE slug = ?", (slug,)
                    ).fetchone()
                    counter += 1

            cur = conn.execute(
                "INSERT INTO categories (name, slug, parent_id, sort_order, image) VALUES (?, ?, ?, ?, ?)",
                (name, slug, parent_id, sort_order, image),
            )
            conn.commit()
            cat = conn.execute(
                "SELECT * FROM categories WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
            return dict(cat)
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create category")


@app.put("/api/categories/{category_id}")
async def update_category(category_id: int, request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT * FROM categories WHERE id = ?", (category_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Category not found")

            name = body.get("name", existing["name"]).strip()
            parent_id = body.get("parent_id", existing["parent_id"])
            image = body.get("image", existing["image"])
            sort_order = body.get("sort_order", existing["sort_order"])

            # Update slug if name changed
            slug = existing["slug"]
            if name != existing["name"]:
                slug = _slugify(name)
                # Check for duplicate slug
                dup = conn.execute(
                    "SELECT id FROM categories WHERE slug = ? AND id != ?", (slug, category_id)
                ).fetchone()
                if dup:
                    base_slug = slug
                    counter = 2
                    while dup:
                        slug = f"{base_slug}-{counter}"
                        dup = conn.execute(
                            "SELECT id FROM categories WHERE slug = ? AND id != ?", (slug, category_id)
                        ).fetchone()
                        counter += 1

            # Prevent circular parent reference
            if parent_id == category_id:
                raise HTTPException(status_code=400, detail="Category cannot be its own parent")

            conn.execute(
                "UPDATE categories SET name=?, slug=?, parent_id=?, sort_order=?, image=? WHERE id=?",
                (name, slug, parent_id, sort_order, image, category_id),
            )
            conn.commit()
            cat = conn.execute(
                "SELECT * FROM categories WHERE id = ?", (category_id,)
            ).fetchone()
            return dict(cat)
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update category")


@app.delete("/api/categories/{category_id}")
async def delete_category(category_id: int, admin_id: int = Depends(verify_token)):
    try:
        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT id FROM categories WHERE id = ?", (category_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Category not found")

            # Set child categories' parent_id to null
            conn.execute(
                "UPDATE categories SET parent_id = NULL WHERE parent_id = ?", (category_id,)
            )
            # Set products' category_id to null
            conn.execute(
                "UPDATE products SET category_id = NULL WHERE category_id = ?", (category_id,)
            )
            conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete category")


@app.patch("/api/categories/reorder")
async def reorder_categories(request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        ids = body.get("ids", [])
        if not ids:
            raise HTTPException(status_code=400, detail="No category IDs provided")

        conn = get_db()
        try:
            for i, cid in enumerate(ids):
                conn.execute(
                    "UPDATE categories SET sort_order = ? WHERE id = ?", (i, cid)
                )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to reorder categories")


# ─── Skin Concerns Routes ────────────────────────────────────────────────────


@app.get("/api/skin-concerns")
async def get_skin_concerns():
    try:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT * FROM skin_concerns ORDER BY sort_order, name"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch skin concerns")


@app.post("/api/skin-concerns")
async def create_skin_concern(request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        name = body.get("name", "").strip()
        sort_order = body.get("sort_order", 0)

        if not name:
            raise HTTPException(status_code=400, detail="Skin concern name is required")

        slug = _slugify(name)

        conn = get_db()
        try:
            # Check for duplicate
            existing = conn.execute(
                "SELECT id FROM skin_concerns WHERE slug = ?", (slug,)
            ).fetchone()
            if existing:
                raise HTTPException(status_code=400, detail="A skin concern with this name already exists")

            cur = conn.execute(
                "INSERT INTO skin_concerns (name, slug, sort_order) VALUES (?, ?, ?)",
                (name, slug, sort_order),
            )
            conn.commit()
            concern = conn.execute(
                "SELECT * FROM skin_concerns WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
            return dict(concern)
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create skin concern")


@app.put("/api/skin-concerns/{concern_id}")
async def update_skin_concern(concern_id: int, request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT * FROM skin_concerns WHERE id = ?", (concern_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Skin concern not found")

            name = body.get("name", existing["name"]).strip()
            sort_order = body.get("sort_order", existing["sort_order"])

            # Update slug if name changed
            slug = existing["slug"]
            if name != existing["name"]:
                slug = _slugify(name)
                dup = conn.execute(
                    "SELECT id FROM skin_concerns WHERE slug = ? AND id != ?", (slug, concern_id)
                ).fetchone()
                if dup:
                    raise HTTPException(status_code=400, detail="A skin concern with this name already exists")

            conn.execute(
                "UPDATE skin_concerns SET name=?, slug=?, sort_order=? WHERE id=?",
                (name, slug, sort_order, concern_id),
            )
            conn.commit()
            concern = conn.execute(
                "SELECT * FROM skin_concerns WHERE id = ?", (concern_id,)
            ).fetchone()
            return dict(concern)
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update skin concern")


@app.delete("/api/skin-concerns/{concern_id}")
async def delete_skin_concern(concern_id: int, admin_id: int = Depends(verify_token)):
    try:
        conn = get_db()
        try:
            existing = conn.execute(
                "SELECT id FROM skin_concerns WHERE id = ?", (concern_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Skin concern not found")

            # Delete associations first
            conn.execute(
                "DELETE FROM product_skin_concerns WHERE skin_concern_id = ?", (concern_id,)
            )
            conn.execute("DELETE FROM skin_concerns WHERE id = ?", (concern_id,))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete skin concern")


@app.patch("/api/skin-concerns/reorder")
async def reorder_skin_concerns(request: Request, admin_id: int = Depends(verify_token)):
    try:
        body = await request.json()
        ids = body.get("ids", [])
        if not ids:
            raise HTTPException(status_code=400, detail="No skin concern IDs provided")

        conn = get_db()
        try:
            for i, cid in enumerate(ids):
                conn.execute(
                    "UPDATE skin_concerns SET sort_order = ? WHERE id = ?", (i, cid)
                )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to reorder skin concerns")


# ─── Product Skin Concerns ──────────────────────────────────────────────────


@app.put("/api/products/{product_id}/skin-concerns")
async def update_product_skin_concerns(product_id: int, request: Request, admin_id: int = Depends(verify_token)):
    """Update the skin concerns associated with a product."""
    try:
        body = await request.json()
        concern_ids = body.get("skin_concern_ids", [])

        conn = get_db()
        try:
            # Verify product exists
            existing = conn.execute(
                "SELECT id FROM products WHERE id = ?", (product_id,)
            ).fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Product not found")

            # Delete existing associations
            conn.execute(
                "DELETE FROM product_skin_concerns WHERE product_id = ?", (product_id,)
            )

            # Insert new associations
            for cid in concern_ids:
                conn.execute(
                    "INSERT OR IGNORE INTO product_skin_concerns (product_id, skin_concern_id) VALUES (?, ?)",
                    (product_id, cid),
                )

            conn.commit()

            # Return updated concerns
            concerns = conn.execute(
                "SELECT sc.id, sc.name, sc.slug FROM skin_concerns sc "
                "INNER JOIN product_skin_concerns psc ON sc.id = psc.skin_concern_id "
                "WHERE psc.product_id = ? ORDER BY sc.sort_order",
                (product_id,)
            ).fetchall()
            return {"skin_concerns": [dict(c) for c in concerns]}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update product skin concerns")


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
    "bg_color", "bg_image", "surface_color", "card_color", "text_color", "timezone",
    "low_stock_threshold", "screen_timeout", "screen_timeout_warning", "cash_payment_message"
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
        payment_method = body.get("payment_method", "card")  # card, cash, split
        cash_amount = float(body.get("cash_amount", 0))
        card_number = body.get("card_number", "")
        card_exp = body.get("card_exp", "")
        card_cvv = body.get("card_cvv", "")
        card_name = body.get("card_name", "")

        if not items:
            raise HTTPException(status_code=400, detail="Cart is empty")

        # Validate payment method requirements
        if payment_method == "card":
            if not card_number or not card_exp or not card_cvv or not card_name:
                raise HTTPException(status_code=400, detail="All card fields are required")
        elif payment_method == "split":
            if cash_amount <= 0:
                raise HTTPException(status_code=400, detail="Cash amount required for split payment")
            if not card_number or not card_exp or not card_cvv or not card_name:
                raise HTTPException(status_code=400, detail="Card details required for split payment")

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

        # Validate stock availability before processing payment
        conn = get_db()
        try:
            for item in items:
                product = conn.execute(
                    "SELECT * FROM products WHERE id = ?", (item["id"],)
                ).fetchone()
                if not product:
                    raise HTTPException(status_code=400, detail=f"Product not found: {item['name']}")

                variants = json.loads(product["variants"] or "[]")
                item_variant = item.get("variant")

                if variants and item_variant:
                    # Check variant stock
                    variant = next((v for v in variants if v["name"] == item_variant), None)
                    if not variant:
                        raise HTTPException(status_code=400, detail=f"Variant not found: {item['name']} - {item_variant}")
                    available = variant.get("stock_qty", 0)
                    if item["qty"] > available:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Insufficient stock for {item['name']} ({item_variant}). Only {available} available."
                        )
                else:
                    # Check product-level stock
                    available = product["stock_qty"]
                    if item["qty"] > available:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Insufficient stock for {item['name']}. Only {available} available."
                        )
        finally:
            conn.close()

        # Calculate payment amounts
        card_amount = 0.0
        final_cash_amount = 0.0

        if payment_method == "cash":
            final_cash_amount = total
        elif payment_method == "card":
            card_amount = total
        elif payment_method == "split":
            final_cash_amount = min(cash_amount, total)
            card_amount = round(total - final_cash_amount, 2)

        # Extract card last 4 digits
        card_last4 = card_number[-4:] if card_number and len(card_number) >= 4 else None

        simulated = False
        payment_ref = ""
        status = "pending"

        # Process card payment if needed
        if card_amount > 0:
            conn = get_db()
            try:
                key_row = conn.execute(
                    "SELECT value FROM site_settings WHERE key = 'usaepay_key'"
                ).fetchone()
                usaepay_key = key_row["value"] if key_row else ""
            finally:
                conn.close()

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
                    "amount": card_amount,
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
        else:
            # Cash-only payment
            payment_ref = f"CASH-{secrets.token_hex(4).upper()}"
            status = "approved"

        # Record order with payment details
        order_items = [
            {
                "id": i["id"],
                "name": i["name"],
                "price": i["price"],
                "qty": i["qty"],
                "variant": i.get("variant")
            }
            for i in items
        ]

        conn = get_db()
        try:
            conn.execute(
                """INSERT INTO orders
                   (items, subtotal, tax, total, payment_ref, status, card_last4, payment_method, card_amount, cash_amount)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (json.dumps(order_items), subtotal, tax, total, payment_ref, status,
                 card_last4, payment_method, card_amount, final_cash_amount),
            )
            conn.commit()

            # Decrement stock if payment approved
            if status == "approved":
                for item in items:
                    product = conn.execute(
                        "SELECT * FROM products WHERE id = ?", (item["id"],)
                    ).fetchone()
                    if not product:
                        continue

                    variants = json.loads(product["variants"] or "[]")
                    item_variant = item.get("variant")

                    if variants and item_variant:
                        # Decrement variant stock
                        for v in variants:
                            if v["name"] == item_variant:
                                v["stock_qty"] = max(0, v.get("stock_qty", 0) - item["qty"])
                                break
                        conn.execute(
                            "UPDATE products SET variants = ? WHERE id = ?",
                            (json.dumps(variants), item["id"])
                        )
                    else:
                        # Decrement product-level stock
                        new_qty = max(0, product["stock_qty"] - item["qty"])
                        conn.execute(
                            "UPDATE products SET stock_qty = ? WHERE id = ?",
                            (new_qty, item["id"])
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
            "payment_method": payment_method,
            "card_amount": card_amount,
            "cash_amount": final_cash_amount,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Checkout failed")


@app.post("/api/stock/check")
async def check_stock(request: Request):
    """Check stock availability for cart items."""
    try:
        body = await request.json()
        items = body.get("items", [])

        if not items:
            return {"available": True, "items": []}

        conn = get_db()
        try:
            result_items = []
            all_available = True

            for item in items:
                product = conn.execute(
                    "SELECT * FROM products WHERE id = ?", (item["id"],)
                ).fetchone()

                if not product:
                    result_items.append({
                        "id": item["id"],
                        "name": item.get("name", "Unknown"),
                        "variant": item.get("variant"),
                        "requested": item["qty"],
                        "available": 0,
                        "sufficient": False
                    })
                    all_available = False
                    continue

                variants = json.loads(product["variants"] or "[]")
                item_variant = item.get("variant")

                if variants and item_variant:
                    variant = next((v for v in variants if v["name"] == item_variant), None)
                    available = variant.get("stock_qty", 0) if variant else 0
                else:
                    available = product["stock_qty"]

                sufficient = item["qty"] <= available
                if not sufficient:
                    all_available = False

                result_items.append({
                    "id": item["id"],
                    "name": item.get("name", product["name"]),
                    "variant": item_variant,
                    "requested": item["qty"],
                    "available": available,
                    "sufficient": sufficient
                })

            return {"available": all_available, "items": result_items}
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Stock check failed")


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


@app.post("/api/orders/{order_id}/void")
async def void_order(order_id: int, admin_id: int = Depends(verify_token)):
    """Void an order - returns stock to inventory and marks order as voided."""
    try:
        conn = get_db()
        try:
            # Get the order
            order = conn.execute(
                "SELECT * FROM orders WHERE id = ?", (order_id,)
            ).fetchone()
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")

            if order["status"] == "voided":
                raise HTTPException(status_code=400, detail="Order is already voided")

            # Only void approved orders (declined orders didn't take stock)
            if order["status"] == "approved":
                # Return stock to products
                items = json.loads(order["items"])
                for item in items:
                    product = conn.execute(
                        "SELECT * FROM products WHERE id = ?", (item["id"],)
                    ).fetchone()
                    if not product:
                        continue

                    variants = json.loads(product["variants"] or "[]")
                    item_variant = item.get("variant")

                    if variants and item_variant:
                        # Return to variant stock
                        for v in variants:
                            if v["name"] == item_variant:
                                v["stock_qty"] = v.get("stock_qty", 0) + item["qty"]
                                break
                        conn.execute(
                            "UPDATE products SET variants = ? WHERE id = ?",
                            (json.dumps(variants), item["id"])
                        )
                    else:
                        # Return to product-level stock
                        new_qty = product["stock_qty"] + item["qty"]
                        conn.execute(
                            "UPDATE products SET stock_qty = ? WHERE id = ?",
                            (new_qty, item["id"])
                        )

            # Mark order as voided
            conn.execute(
                "UPDATE orders SET status = 'voided' WHERE id = ?",
                (order_id,)
            )
            conn.commit()

            return {"ok": True, "message": "Order voided and stock returned"}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to void order")


@app.delete("/api/orders/{order_id}")
async def delete_order(order_id: int, admin_id: int = Depends(verify_token)):
    """Permanently delete an order from the system."""
    try:
        conn = get_db()
        try:
            # Get the order
            order = conn.execute(
                "SELECT * FROM orders WHERE id = ?", (order_id,)
            ).fetchone()
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")

            # If order was approved and not voided, return stock first
            if order["status"] == "approved":
                items = json.loads(order["items"])
                for item in items:
                    product = conn.execute(
                        "SELECT * FROM products WHERE id = ?", (item["id"],)
                    ).fetchone()
                    if not product:
                        continue

                    variants = json.loads(product["variants"] or "[]")
                    item_variant = item.get("variant")

                    if variants and item_variant:
                        # Return to variant stock
                        for v in variants:
                            if v["name"] == item_variant:
                                v["stock_qty"] = v.get("stock_qty", 0) + item["qty"]
                                break
                        conn.execute(
                            "UPDATE products SET variants = ? WHERE id = ?",
                            (json.dumps(variants), item["id"])
                        )
                    else:
                        # Return to product-level stock
                        new_qty = product["stock_qty"] + item["qty"]
                        conn.execute(
                            "UPDATE products SET stock_qty = ? WHERE id = ?",
                            (new_qty, item["id"])
                        )

            # Delete the order
            conn.execute("DELETE FROM orders WHERE id = ?", (order_id,))
            conn.commit()

            return {"ok": True, "message": "Order deleted permanently"}
        finally:
            conn.close()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete order")


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
                        # Handle both old (in_stock) and new (stock_qty) backups
                        stock = p.get("stock_qty", p.get("in_stock", 0))
                        if stock == 1 and "stock_qty" not in p:
                            stock = 10  # Convert boolean to quantity
                        variants = p.get("variants", "[]")
                        if isinstance(variants, list):
                            variants = json.dumps(variants)
                        conn.execute(
                            """INSERT INTO products
                               (id, name, description, price, image, category, stock_qty, sort_order, variants, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (p.get("id"), p.get("name"), p.get("description", ""),
                             p.get("price"), p.get("image", ""), p.get("category", "General"),
                             stock, p.get("sort_order", 0), variants, p.get("created_at"))
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
                               (id, items, subtotal, tax, total, payment_ref, status,
                                card_last4, payment_method, card_amount, cash_amount, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (o.get("id"), items, o.get("subtotal"),
                             o.get("tax"), o.get("total"), o.get("payment_ref", ""),
                             o.get("status", "pending"), o.get("card_last4"),
                             o.get("payment_method", "card"), o.get("card_amount", o.get("total", 0)),
                             o.get("cash_amount", 0), o.get("created_at"))
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
