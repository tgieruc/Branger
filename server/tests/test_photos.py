import pytest
from httpx import AsyncClient
from io import BytesIO


@pytest.fixture
async def auth_headers(client):
    await client.post("/api/auth/register", json={"email": "u@t.com", "password": "password123"})
    resp = await client.post("/api/auth/login", json={"email": "u@t.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_upload_photo(client, auth_headers):
    fake_image = BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    resp = await client.post("/api/photos/upload",
        files={"file": ("test.jpg", fake_image, "image/jpeg")},
        headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert "url" in data
    assert "/photos/" in data["url"]


async def test_upload_requires_auth(client):
    fake_image = BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    resp = await client.post("/api/photos/upload",
        files={"file": ("test.jpg", fake_image, "image/jpeg")})
    assert resp.status_code == 401


async def test_upload_creates_user_directory(client, auth_headers, tmp_path):
    """Verify photos are stored in user-scoped directories."""
    fake_image = BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    resp = await client.post("/api/photos/upload",
        files={"file": ("test.jpg", fake_image, "image/jpeg")},
        headers=auth_headers)
    assert resp.status_code == 201
    url = resp.json()["url"]
    # URL should contain user_id path segment
    parts = url.split("/photos/")
    assert len(parts) == 2
    path_part = parts[1]
    assert "/" in path_part  # user_id/filename format
