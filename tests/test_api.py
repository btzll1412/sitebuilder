"""
Backend API tests — covers all routes, auth, CRUD, checkout.
"""

import json
import os
import sys
import time

import pytest

# Ensure we can import the backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Use a test database
os.environ['TESTING'] = '1'

from fastapi.testclient import TestClient
from main import app, DB_PATH, DATA_DIR, init_db, get_db

# ─── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def setup_db(tmp_path, monkeypatch):
    """Use a temporary database for each test."""
    test_db = tmp_path / "test.db"
    import main
    monkeypatch.setattr(main, 'DB_PATH', test_db)
    monkeypatch.setattr(main, 'DATA_DIR', tmp_path)
    init_db()
    yield
    if test_db.exists():
        test_db.unlink()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_token(client):
    """Get a valid admin token."""
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    return resp.json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ─── Health ──────────────────────────────────────────────────────────────────


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "version" in data


# ─── Auth ────────────────────────────────────────────────────────────────────


def test_login_success(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["username"] == "admin"


def test_login_failure(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_login_missing_fields(client):
    resp = client.post("/api/auth/login", json={"username": "", "password": ""})
    assert resp.status_code == 400


def test_login_rate_limiting(client, monkeypatch):
    """After 5 failed attempts, should get 429."""
    import main
    monkeypatch.setattr(main, 'login_attempts', {})

    for _ in range(5):
        client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})

    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 429


def test_protected_route_without_token(client):
    resp = client.get("/api/products/all")
    assert resp.status_code == 401


def test_protected_route_with_invalid_token(client):
    resp = client.get("/api/products/all", headers={"Authorization": "Bearer invalidtoken"})
    assert resp.status_code == 401


def test_logout(client, auth_token):
    resp = client.post("/api/auth/logout", headers=auth_headers(auth_token))
    assert resp.status_code == 200

    # Token should no longer work
    resp = client.get("/api/products/all", headers=auth_headers(auth_token))
    assert resp.status_code == 401


def test_change_password(client, auth_token):
    resp = client.post(
        "/api/auth/change-password",
        json={"password": "newpassword123"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200

    # Login with new password
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "newpassword123"})
    assert resp.status_code == 200


def test_change_password_too_short(client, auth_token):
    resp = client.post(
        "/api/auth/change-password",
        json={"password": "ab"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 400


# ─── Products ────────────────────────────────────────────────────────────────


def test_get_products(client):
    resp = client.get("/api/products")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 6  # seed data


def test_get_products_by_category(client):
    resp = client.get("/api/products?category=Lips")
    assert resp.status_code == 200
    data = resp.json()
    assert all(p["category"] == "Lips" for p in data)


def test_get_all_products_admin(client, auth_token):
    resp = client.get("/api/products/all", headers=auth_headers(auth_token))
    assert resp.status_code == 200
    assert len(resp.json()) == 6


def test_get_categories(client):
    resp = client.get("/api/products/categories")
    assert resp.status_code == 200
    cats = resp.json()
    assert "Lips" in cats
    assert "Eyes" in cats
    assert "Face" in cats


def test_create_product(client, auth_token):
    resp = client.post(
        "/api/products",
        data={"name": "Test Product", "price": "19.99", "category": "Test"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Product"
    assert data["price"] == 19.99


def test_create_product_validation(client, auth_token):
    resp = client.post(
        "/api/products",
        data={"name": "", "price": "0"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code in (400, 422)  # FastAPI may return 422 for form validation


def test_update_product(client, auth_token):
    # Get first product ID
    products = client.get("/api/products/all", headers=auth_headers(auth_token)).json()
    pid = products[0]["id"]

    resp = client.put(
        f"/api/products/{pid}",
        data={"name": "Updated Name", "price": "29.99", "category": "Lips"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


def test_delete_product(client, auth_token):
    products = client.get("/api/products/all", headers=auth_headers(auth_token)).json()
    pid = products[-1]["id"]

    resp = client.delete(f"/api/products/{pid}", headers=auth_headers(auth_token))
    assert resp.status_code == 200

    # Verify deleted
    remaining = client.get("/api/products/all", headers=auth_headers(auth_token)).json()
    assert len(remaining) == len(products) - 1


def test_delete_nonexistent_product(client, auth_token):
    resp = client.delete("/api/products/9999", headers=auth_headers(auth_token))
    assert resp.status_code == 404


def test_reorder_products(client, auth_token):
    products = client.get("/api/products/all", headers=auth_headers(auth_token)).json()
    ids = [p["id"] for p in products]
    reversed_ids = list(reversed(ids))

    resp = client.patch(
        "/api/products/reorder",
        json={"ids": reversed_ids},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200


# ─── Pages ───────────────────────────────────────────────────────────────────


def test_get_pages(client):
    resp = client.get("/api/pages")
    assert resp.status_code == 200
    pages = resp.json()
    assert len(pages) >= 1
    assert any(p["slug"] == "home" for p in pages)


def test_get_page_by_slug(client):
    resp = client.get("/api/pages/home")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == "home"
    assert isinstance(data["layout"], list)


def test_get_nonexistent_page(client):
    resp = client.get("/api/pages/nonexistent")
    assert resp.status_code == 404


def test_create_page(client, auth_token):
    resp = client.post(
        "/api/pages",
        json={"slug": "about", "title": "About Us"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200
    assert resp.json()["slug"] == "about"


def test_create_page_duplicate_slug(client, auth_token):
    resp = client.post(
        "/api/pages",
        json={"slug": "home", "title": "Another Home"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 400


def test_create_page_invalid_slug(client, auth_token):
    resp = client.post(
        "/api/pages",
        json={"slug": "Has Spaces!", "title": "Bad Slug"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 400


def test_update_page(client, auth_token):
    pages = client.get("/api/pages").json()
    home = next(p for p in pages if p["slug"] == "home")

    resp = client.put(
        f"/api/pages/{home['id']}",
        json={"title": "New Home Title", "layout": [], "published": 1},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200


def test_delete_home_page(client, auth_token):
    pages = client.get("/api/pages").json()
    home = next(p for p in pages if p["is_home"])

    resp = client.delete(f"/api/pages/{home['id']}", headers=auth_headers(auth_token))
    assert resp.status_code == 400  # Can't delete home page


def test_delete_page(client, auth_token):
    # Create a page first
    client.post("/api/pages", json={"slug": "temp", "title": "Temp"}, headers=auth_headers(auth_token))
    pages = client.get("/api/pages").json()
    temp = next(p for p in pages if p["slug"] == "temp")

    resp = client.delete(f"/api/pages/{temp['id']}", headers=auth_headers(auth_token))
    assert resp.status_code == 200


# ─── Settings ────────────────────────────────────────────────────────────────


def test_get_settings_public(client):
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "site_name" in data
    # Should NOT expose payment keys
    assert "usaepay_key" not in data


def test_get_settings_admin(client, auth_token):
    resp = client.get("/api/settings/admin", headers=auth_headers(auth_token))
    assert resp.status_code == 200
    data = resp.json()
    assert "usaepay_key" in data


def test_update_settings(client, auth_token):
    resp = client.put(
        "/api/settings",
        json={"site_name": "My Store", "tax_rate": "10.0"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200

    # Verify
    data = client.get("/api/settings").json()
    assert data["site_name"] == "My Store"
    assert data["tax_rate"] == "10.0"


# ─── Checkout & Orders ──────────────────────────────────────────────────────


def test_checkout_simulation(client):
    resp = client.post("/api/checkout", json={
        "items": [{"id": 1, "name": "Test", "price": 24.0, "qty": 2}],
        "card_number": "4111111111111111",
        "card_exp": "0128",
        "card_cvv": "123",
        "card_name": "Jane Smith",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["simulated"] is True
    assert data["ref"].startswith("SIM-")
    assert data["total"] > 0


def test_checkout_empty_cart(client):
    resp = client.post("/api/checkout", json={
        "items": [],
        "card_number": "4111111111111111",
        "card_exp": "0128",
        "card_cvv": "123",
        "card_name": "Jane",
    })
    assert resp.status_code == 400


def test_checkout_missing_card(client):
    resp = client.post("/api/checkout", json={
        "items": [{"id": 1, "name": "Test", "price": 24.0, "qty": 1}],
        "card_number": "",
        "card_exp": "0128",
        "card_cvv": "123",
        "card_name": "Jane",
    })
    assert resp.status_code == 400


def test_orders_list(client, auth_token):
    # Create an order first
    client.post("/api/checkout", json={
        "items": [{"id": 1, "name": "Test Product", "price": 24.0, "qty": 1}],
        "card_number": "4111111111111111",
        "card_exp": "0128",
        "card_cvv": "123",
        "card_name": "Jane Smith",
    })

    resp = client.get("/api/orders", headers=auth_headers(auth_token))
    assert resp.status_code == 200
    orders = resp.json()
    assert len(orders) >= 1
    assert isinstance(orders[0]["items"], list)


def test_orders_stats(client, auth_token):
    resp = client.get("/api/orders/stats", headers=auth_headers(auth_token))
    assert resp.status_code == 200
    data = resp.json()
    assert "total_revenue" in data
    assert "order_count" in data
    assert "avg_order" in data


# ─── Upload ──────────────────────────────────────────────────────────────────


def test_upload_wrong_type(client, auth_token, tmp_path):
    test_file = tmp_path / "test.txt"
    test_file.write_text("not an image")

    with open(test_file, "rb") as f:
        resp = client.post(
            "/api/upload",
            files={"file": ("test.txt", f, "text/plain")},
            headers=auth_headers(auth_token),
        )
    assert resp.status_code == 400
