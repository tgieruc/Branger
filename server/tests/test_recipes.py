import pytest


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
async def auth_headers(client):
    await client.post(
        "/api/auth/register",
        json={"email": "user@test.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "user@test.com", "password": "password123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def other_auth_headers(client, auth_headers):
    await client.post(
        "/api/auth/register",
        json={"email": "other@test.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "other@test.com", "password": "password123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


SAMPLE_RECIPE = {
    "title": "Pasta Carbonara",
    "ingredients": [
        {"name": "Spaghetti", "description": "500g", "position": 0},
        {"name": "Bacon", "description": "200g diced", "position": 1},
        {"name": "Eggs", "description": "3 large", "position": 2},
    ],
    "steps": [
        {"step_number": 1, "instruction": "Cook the spaghetti in boiling water."},
        {"step_number": 2, "instruction": "Fry the bacon until crispy."},
        {"step_number": 3, "instruction": "Mix eggs and combine with pasta and bacon."},
    ],
    "servings": "4",
    "prep_time": "10 min",
    "cook_time": "20 min",
}


# ── 1. Create recipe ─────────────────────────────────────────────

async def test_create_recipe(client, auth_headers):
    resp = await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Pasta Carbonara"
    assert "id" in data
    assert len(data["ingredients"]) == 3
    assert len(data["steps"]) == 3
    # Ingredients should be sorted by position
    assert data["ingredients"][0]["name"] == "Spaghetti"
    assert data["ingredients"][1]["name"] == "Bacon"
    # Steps should be sorted by step_number
    assert data["steps"][0]["step_number"] == 1
    assert data["steps"][2]["step_number"] == 3
    assert data["servings"] == "4"
    assert data["prep_time"] == "10 min"
    assert data["cook_time"] == "20 min"


# ── 2. Create recipe without title fails ─────────────────────────

async def test_create_recipe_without_title_fails(client, auth_headers):
    resp = await client.post(
        "/api/recipes/",
        json={"title": "", "ingredients": [], "steps": []},
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ── 3. Get recipe ────────────────────────────────────────────────

async def test_get_recipe(client, auth_headers):
    create_resp = await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    recipe_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/recipes/{recipe_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == recipe_id
    assert data["title"] == "Pasta Carbonara"
    assert len(data["ingredients"]) == 3
    assert len(data["steps"]) == 3


# ── 4. Get other user's recipe returns 404 ───────────────────────

async def test_get_other_users_recipe_returns_404(
    client, auth_headers, other_auth_headers
):
    create_resp = await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    recipe_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/recipes/{recipe_id}",
        headers=other_auth_headers,
    )
    assert resp.status_code == 404


# ── 5. List recipes returns own only ─────────────────────────────

async def test_list_recipes_returns_own_only(
    client, auth_headers, other_auth_headers
):
    # User 1 creates a recipe
    await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    # User 2 creates a recipe
    await client.post(
        "/api/recipes/",
        json={"title": "Other Recipe", "ingredients": [], "steps": []},
        headers=other_auth_headers,
    )

    # User 1 should only see their own recipe
    resp = await client.get("/api/recipes/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["recipes"]) == 1
    assert data["recipes"][0]["title"] == "Pasta Carbonara"

    # User 2 should only see their own recipe
    resp2 = await client.get("/api/recipes/", headers=other_auth_headers)
    data2 = resp2.json()
    assert len(data2["recipes"]) == 1
    assert data2["recipes"][0]["title"] == "Other Recipe"


# ── 6. Update recipe ─────────────────────────────────────────────

async def test_update_recipe(client, auth_headers):
    create_resp = await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    recipe_id = create_resp.json()["id"]

    updated = {
        "title": "Updated Carbonara",
        "ingredients": [
            {"name": "Penne", "description": "400g", "position": 0},
        ],
        "steps": [
            {"step_number": 1, "instruction": "Cook penne and mix."},
        ],
        "servings": "2",
    }
    resp = await client.put(
        f"/api/recipes/{recipe_id}",
        json=updated,
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated Carbonara"
    assert len(data["ingredients"]) == 1
    assert data["ingredients"][0]["name"] == "Penne"
    assert len(data["steps"]) == 1
    assert data["servings"] == "2"


# ── 7. Update other user's recipe returns 404 ────────────────────

async def test_update_other_users_recipe_returns_404(
    client, auth_headers, other_auth_headers
):
    create_resp = await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    recipe_id = create_resp.json()["id"]

    resp = await client.put(
        f"/api/recipes/{recipe_id}",
        json={"title": "Hijacked", "ingredients": [], "steps": []},
        headers=other_auth_headers,
    )
    assert resp.status_code == 404


# ── 8. Delete recipe ─────────────────────────────────────────────

async def test_delete_recipe(client, auth_headers):
    create_resp = await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    recipe_id = create_resp.json()["id"]

    resp = await client.delete(
        f"/api/recipes/{recipe_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # Should no longer be retrievable
    get_resp = await client.get(
        f"/api/recipes/{recipe_id}",
        headers=auth_headers,
    )
    assert get_resp.status_code == 404


# ── 9. Delete other user's recipe returns 404 ────────────────────

async def test_delete_other_users_recipe_returns_404(
    client, auth_headers, other_auth_headers
):
    create_resp = await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    recipe_id = create_resp.json()["id"]

    resp = await client.delete(
        f"/api/recipes/{recipe_id}",
        headers=other_auth_headers,
    )
    assert resp.status_code == 404

    # Original owner should still be able to get it
    get_resp = await client.get(
        f"/api/recipes/{recipe_id}",
        headers=auth_headers,
    )
    assert get_resp.status_code == 200


# ── 10. Search recipes ───────────────────────────────────────────

async def test_search_recipes(client, auth_headers):
    # Create two recipes
    await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,  # "Pasta Carbonara" with "Bacon" ingredient
        headers=auth_headers,
    )
    await client.post(
        "/api/recipes/",
        json={
            "title": "Green Salad",
            "ingredients": [
                {"name": "Lettuce", "description": "1 head", "position": 0},
            ],
            "steps": [
                {"step_number": 1, "instruction": "Chop and serve."},
            ],
        },
        headers=auth_headers,
    )

    # Search by title — "pasta" should match "Pasta Carbonara"
    resp = await client.get(
        "/api/recipes/?q=pasta",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["recipes"]) == 1
    assert data["recipes"][0]["title"] == "Pasta Carbonara"

    # Search by ingredient — "bacon" should match "Pasta Carbonara"
    resp2 = await client.get(
        "/api/recipes/?q=bacon",
        headers=auth_headers,
    )
    data2 = resp2.json()
    assert len(data2["recipes"]) == 1
    assert data2["recipes"][0]["title"] == "Pasta Carbonara"


# ── 11. Pagination ───────────────────────────────────────────────

async def test_recipe_pagination(client, auth_headers):
    # Create 5 recipes
    for i in range(5):
        await client.post(
            "/api/recipes/",
            json={"title": f"Recipe {i}", "ingredients": [], "steps": []},
            headers=auth_headers,
        )

    # First page: limit=2
    resp = await client.get(
        "/api/recipes/?limit=2",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["recipes"]) == 2
    assert data["has_more"] is True

    # Use cursor from last recipe to get next page
    last = data["recipes"][-1]
    cursor_time = last["created_at"]
    cursor_id = last["id"]
    resp2 = await client.get(
        f"/api/recipes/?limit=2&cursor_time={cursor_time}&cursor_id={cursor_id}",
        headers=auth_headers,
    )
    data2 = resp2.json()
    assert len(data2["recipes"]) == 2
    assert data2["has_more"] is True

    # Third page should have 1 remaining
    last2 = data2["recipes"][-1]
    resp3 = await client.get(
        f"/api/recipes/?limit=2&cursor_time={last2['created_at']}&cursor_id={last2['id']}",
        headers=auth_headers,
    )
    data3 = resp3.json()
    assert len(data3["recipes"]) == 1
    assert data3["has_more"] is False

    # All recipe IDs should be unique (no duplicates across pages)
    all_ids = (
        [r["id"] for r in data["recipes"]]
        + [r["id"] for r in data2["recipes"]]
        + [r["id"] for r in data3["recipes"]]
    )
    assert len(all_ids) == len(set(all_ids)) == 5


# ── 12. Share recipe ─────────────────────────────────────────────

async def test_share_recipe(client, auth_headers):
    create_resp = await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    recipe_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/recipes/{recipe_id}/share",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "share_token" in data
    assert "share_url" in data
    assert data["share_token"] in data["share_url"]


# ── 13. Get shared recipe (public) ───────────────────────────────

async def test_get_shared_recipe_public(client, auth_headers):
    # Create and share a recipe
    create_resp = await client.post(
        "/api/recipes/",
        json=SAMPLE_RECIPE,
        headers=auth_headers,
    )
    recipe_id = create_resp.json()["id"]

    share_resp = await client.post(
        f"/api/recipes/{recipe_id}/share",
        headers=auth_headers,
    )
    token = share_resp.json()["share_token"]

    # Access WITHOUT auth — should still work
    resp = await client.get(f"/api/share/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Pasta Carbonara"
    assert len(data["ingredients"]) == 3
    assert len(data["steps"]) == 3
