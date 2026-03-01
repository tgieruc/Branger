import pytest


# ── Registration ───────────────────────────────────────────────────
async def test_register_first_user_becomes_admin(client):
    resp = await client.post(
        "/api/auth/register",
        json={"email": "admin@example.com", "password": "secret123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "admin@example.com"
    assert data["is_admin"] is True
    assert "id" in data


async def test_register_second_user_is_not_admin(client):
    await client.post(
        "/api/auth/register",
        json={"email": "first@example.com", "password": "secret123"},
    )
    resp = await client.post(
        "/api/auth/register",
        json={"email": "second@example.com", "password": "secret123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["is_admin"] is False


async def test_register_duplicate_email_fails(client):
    await client.post(
        "/api/auth/register",
        json={"email": "dup@example.com", "password": "secret123"},
    )
    resp = await client.post(
        "/api/auth/register",
        json={"email": "dup@example.com", "password": "secret123"},
    )
    assert resp.status_code == 409


async def test_register_short_password_fails(client):
    resp = await client.post(
        "/api/auth/register",
        json={"email": "short@example.com", "password": "12345"},
    )
    assert resp.status_code == 422


# ── Login ──────────────────────────────────────────────────────────
async def test_login_returns_tokens(client):
    await client.post(
        "/api/auth/register",
        json={"email": "login@example.com", "password": "secret123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "secret123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client):
    await client.post(
        "/api/auth/register",
        json={"email": "user@example.com", "password": "secret123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "wrong"},
    )
    assert resp.status_code == 401


async def test_login_nonexistent_user(client):
    resp = await client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "secret123"},
    )
    assert resp.status_code == 401


# ── Refresh ────────────────────────────────────────────────────────
async def test_refresh_token_returns_new_access_token(client):
    await client.post(
        "/api/auth/register",
        json={"email": "refresh@example.com", "password": "secret123"},
    )
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "refresh@example.com", "password": "secret123"},
    )
    refresh_token = login_resp.json()["refresh_token"]

    resp = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_refresh_with_invalid_token_fails(client):
    resp = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": "bad-token"},
    )
    assert resp.status_code == 401


# ── Change password ────────────────────────────────────────────────
async def test_change_password(client):
    await client.post(
        "/api/auth/register",
        json={"email": "chpw@example.com", "password": "oldpass123"},
    )
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "chpw@example.com", "password": "oldpass123"},
    )
    token = login_resp.json()["access_token"]

    resp = await client.put(
        "/api/auth/change-password",
        json={"current_password": "oldpass123", "new_password": "newpass456"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    # Old password should no longer work
    old_login = await client.post(
        "/api/auth/login",
        json={"email": "chpw@example.com", "password": "oldpass123"},
    )
    assert old_login.status_code == 401

    # New password should work
    new_login = await client.post(
        "/api/auth/login",
        json={"email": "chpw@example.com", "password": "newpass456"},
    )
    assert new_login.status_code == 200


async def test_change_password_wrong_current(client):
    await client.post(
        "/api/auth/register",
        json={"email": "chpw2@example.com", "password": "correct123"},
    )
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "chpw2@example.com", "password": "correct123"},
    )
    token = login_resp.json()["access_token"]

    resp = await client.put(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "newpass456"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401


# ── Protected routes ───────────────────────────────────────────────
async def test_protected_route_without_token(client):
    resp = await client.get("/api/recipes/")
    assert resp.status_code == 401


async def test_protected_route_with_invalid_token(client):
    resp = await client.get(
        "/api/recipes/",
        headers={"Authorization": "Bearer invalid-token-here"},
    )
    assert resp.status_code == 401
