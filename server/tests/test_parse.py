import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
async def auth_headers(client):
    await client.post(
        "/api/auth/register",
        json={"email": "u@t.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "u@t.com", "password": "password123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


MOCK_RECIPE_JSON = '{"title":"Pasta","ingredients":[{"name":"Spaghetti","description":"500g"}],"steps":["Boil water","Cook pasta"]}'

MOCK_MISTRAL_CHAT_RESPONSE = MagicMock(
    status_code=200,
    json=lambda: {
        "choices": [{"message": {"content": MOCK_RECIPE_JSON}}]
    },
    raise_for_status=lambda: None,
)

MOCK_MISTRAL_OCR_RESPONSE = MagicMock(
    status_code=200,
    json=lambda: {
        "pages": [{"markdown": "Recipe text from OCR\nSpaghetti 500g\nBoil water"}]
    },
    raise_for_status=lambda: None,
)

MOCK_URL_FETCH_RESPONSE = MagicMock(
    status_code=200,
    text="<html><body><h1>Pasta Recipe</h1><p>Spaghetti 500g</p></body></html>",
    url="https://example.com/recipe",
    raise_for_status=lambda: None,
)


# ── Test 1: Parse text ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_parse_text(client, auth_headers):
    mock_post = AsyncMock(return_value=MOCK_MISTRAL_CHAT_RESPONSE)

    with patch("app.parse.service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post = mock_post
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_instance

        resp = await client.post(
            "/api/recipes/parse/text",
            json={"text": "Spaghetti recipe: boil 500g pasta in water"},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Pasta"
    assert len(data["ingredients"]) == 1
    assert data["ingredients"][0]["name"] == "Spaghetti"
    assert data["ingredients"][0]["description"] == "500g"
    assert data["steps"] == ["Boil water", "Cook pasta"]


# ── Test 2: Parse URL ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_parse_url(client, auth_headers):
    mock_chat_post = AsyncMock(return_value=MOCK_MISTRAL_CHAT_RESPONSE)

    # We need to mock both the URL fetch (get) and the Mistral call (post)
    with patch("app.parse.service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.get = AsyncMock(return_value=MOCK_URL_FETCH_RESPONSE)
        mock_instance.post = mock_chat_post
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_instance

        resp = await client.post(
            "/api/recipes/parse/url",
            json={"url": "https://example.com/recipe"},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Pasta"
    assert len(data["ingredients"]) == 1
    assert data["steps"] == ["Boil water", "Cook pasta"]


# ── Test 3: Parse photo ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_parse_photo(client, auth_headers):
    # Track which URL is being called to return appropriate mock
    async def mock_post_side_effect(url, **kwargs):
        if "ocr" in url:
            return MOCK_MISTRAL_OCR_RESPONSE
        return MOCK_MISTRAL_CHAT_RESPONSE

    with patch("app.parse.service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post = AsyncMock(side_effect=mock_post_side_effect)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_instance

        resp = await client.post(
            "/api/recipes/parse/photo",
            json={"image_urls": ["https://example.com/photo.jpg"]},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Pasta"
    assert len(data["ingredients"]) == 1
    assert data["steps"] == ["Boil water", "Cook pasta"]


# ── Test 4: Text too long ────────────────────────────────────────

@pytest.mark.asyncio
async def test_parse_text_too_long(client, auth_headers):
    resp = await client.post(
        "/api/recipes/parse/text",
        json={"text": "a" * 15001},
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ── Test 5: SSRF protection — private IPs blocked ────────────────

@pytest.mark.asyncio
async def test_parse_url_private_ip_blocked(client, auth_headers):
    for private_url in [
        "http://192.168.1.1/recipe",
        "http://10.0.0.1/recipe",
        "http://127.0.0.1/recipe",
    ]:
        resp = await client.post(
            "/api/recipes/parse/url",
            json={"url": private_url},
            headers=auth_headers,
        )
        assert resp.status_code == 400, f"Expected 400 for {private_url}, got {resp.status_code}"
        assert "private" in resp.json()["detail"].lower() or "internal" in resp.json()["detail"].lower()


# ── Test 6: Requires auth ────────────────────────────────────────

@pytest.mark.asyncio
async def test_parse_requires_auth(client):
    endpoints = [
        ("/api/recipes/parse/text", {"text": "some recipe"}),
        ("/api/recipes/parse/url", {"url": "https://example.com/recipe"}),
        ("/api/recipes/parse/photo", {"image_urls": ["https://example.com/photo.jpg"]}),
    ]
    for endpoint, body in endpoints:
        resp = await client.post(endpoint, json=body)
        assert resp.status_code == 401, f"Expected 401 for {endpoint}, got {resp.status_code}"
