import jwt
import pytest
from httpx import AsyncClient

from app.config import settings


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


# ── Admin password reset ──────────────────────────────────────────


async def test_admin_reset_password(client):
    # Register admin (first user)
    admin_reg = await client.post(
        "/api/auth/register",
        json={"email": "admin@t.com", "password": "password123"},
    )
    admin_headers = {"Authorization": f"Bearer {admin_reg.json()['access_token']}"}

    # Register regular user
    reg = await client.post(
        "/api/auth/register",
        json={"email": "user@t.com", "password": "old_pass"},
    )
    user_id = decode_access_token(reg.json()["access_token"])["sub"]

    # Admin resets user's password
    resp = await client.put(
        f"/api/admin/users/{user_id}/reset-password",
        json={"new_password": "new_pass123"},
        headers=admin_headers,
    )
    assert resp.status_code == 200

    # User can login with new password
    login2 = await client.post(
        "/api/auth/login",
        json={"email": "user@t.com", "password": "new_pass123"},
    )
    assert login2.status_code == 200


async def test_non_admin_cannot_reset_password(client):
    # Register admin (first user)
    await client.post(
        "/api/auth/register",
        json={"email": "admin@t.com", "password": "password123"},
    )

    # Register regular user
    reg = await client.post(
        "/api/auth/register",
        json={"email": "user@t.com", "password": "password123"},
    )
    user_token = reg.json()["access_token"]
    user_id = decode_access_token(user_token)["sub"]
    user_headers = {"Authorization": f"Bearer {user_token}"}

    resp = await client.put(
        f"/api/admin/users/{user_id}/reset-password",
        json={"new_password": "hacked"},
        headers=user_headers,
    )
    assert resp.status_code == 403


async def test_admin_reset_nonexistent_user(client):
    # Register admin (first user)
    await client.post(
        "/api/auth/register",
        json={"email": "admin@t.com", "password": "password123"},
    )
    login = await client.post(
        "/api/auth/login",
        json={"email": "admin@t.com", "password": "password123"},
    )
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.put(
        "/api/admin/users/nonexistent-id/reset-password",
        json={"new_password": "newpass"},
        headers=admin_headers,
    )
    assert resp.status_code == 404
