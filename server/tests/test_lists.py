import pytest


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
async def auth_headers(client):
    await client.post(
        "/api/auth/register",
        json={"email": "listuser@test.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "listuser@test.com", "password": "password123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
async def other_auth_headers(client, auth_headers):
    await client.post(
        "/api/auth/register",
        json={"email": "otherlist@test.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "otherlist@test.com", "password": "password123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ── 1. Create list ───────────────────────────────────────────────

async def test_create_list(client, auth_headers):
    resp = await client.post(
        "/api/lists/",
        json={"name": "Groceries"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Groceries"
    assert "id" in data
    # Creator is auto-added as member
    assert len(data["members"]) == 1


# ── 2. Create list with empty name fails ────────────────────────

async def test_create_list_empty_name_fails(client, auth_headers):
    resp = await client.post(
        "/api/lists/",
        json={"name": "   "},
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ── 3. List my lists ────────────────────────────────────────────

async def test_list_my_lists(client, auth_headers, other_auth_headers):
    # User 1 creates a list
    await client.post(
        "/api/lists/",
        json={"name": "User1 List"},
        headers=auth_headers,
    )
    # User 2 creates a list
    await client.post(
        "/api/lists/",
        json={"name": "User2 List"},
        headers=other_auth_headers,
    )

    # User 1 should only see their own list
    resp = await client.get("/api/lists/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "User1 List"


# ── 4. List includes item counts ────────────────────────────────

async def test_list_includes_item_counts(client, auth_headers):
    # Create list
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Counted List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    # Add 3 items
    await client.post(
        f"/api/lists/{list_id}/items",
        json=[
            {"name": "Apples"},
            {"name": "Bananas"},
            {"name": "Cherries"},
        ],
        headers=auth_headers,
    )

    # Check one item
    detail_resp = await client.get(
        f"/api/lists/{list_id}",
        headers=auth_headers,
    )
    item_id = detail_resp.json()["items"][0]["id"]
    await client.put(
        f"/api/lists/{list_id}/items/{item_id}",
        json={"checked": True},
        headers=auth_headers,
    )

    # List should include counts
    resp = await client.get("/api/lists/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["item_count"] == 3
    assert data[0]["unchecked_count"] == 2


# ── 5. Get list detail ──────────────────────────────────────────

async def test_get_list_detail(client, auth_headers):
    # Create list
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Detail List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    # Add items
    await client.post(
        f"/api/lists/{list_id}/items",
        json=[{"name": "Milk"}, {"name": "Eggs"}],
        headers=auth_headers,
    )

    resp = await client.get(
        f"/api/lists/{list_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Detail List"
    assert len(data["items"]) == 2
    assert len(data["members"]) == 1
    assert "id" in data
    assert "created_at" in data


# ── 6. Get list as non-member returns 403 ───────────────────────

async def test_get_list_non_member_returns_403(
    client, auth_headers, other_auth_headers
):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Private List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/lists/{list_id}",
        headers=other_auth_headers,
    )
    assert resp.status_code == 403


# ── 7. Add items to list ────────────────────────────────────────

async def test_add_items_to_list(client, auth_headers):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Items List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/lists/{list_id}/items",
        json=[
            {"name": "Bread", "description": "Whole wheat"},
            {"name": "Butter"},
        ],
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Bread"
    assert data[0]["description"] == "Whole wheat"
    assert data[1]["name"] == "Butter"
    assert "id" in data[0]


# ── 8. Add items as non-member returns 403 ──────────────────────

async def test_add_items_non_member_returns_403(
    client, auth_headers, other_auth_headers
):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Private Items"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/lists/{list_id}/items",
        json=[{"name": "Sneaky Item"}],
        headers=other_auth_headers,
    )
    assert resp.status_code == 403


# ── 9. Toggle item ──────────────────────────────────────────────

async def test_toggle_item(client, auth_headers):
    # Create list + add item
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Toggle List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    items_resp = await client.post(
        f"/api/lists/{list_id}/items",
        json=[{"name": "Milk"}],
        headers=auth_headers,
    )
    item_id = items_resp.json()[0]["id"]

    # Toggle checked
    resp = await client.put(
        f"/api/lists/{list_id}/items/{item_id}",
        json={"checked": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["checked"] is True


# ── 10. Delete item ─────────────────────────────────────────────

async def test_delete_item(client, auth_headers):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Delete Item List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    items_resp = await client.post(
        f"/api/lists/{list_id}/items",
        json=[{"name": "Temp Item"}],
        headers=auth_headers,
    )
    item_id = items_resp.json()[0]["id"]

    resp = await client.delete(
        f"/api/lists/{list_id}/items/{item_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # Verify item is gone
    detail = await client.get(
        f"/api/lists/{list_id}",
        headers=auth_headers,
    )
    assert len(detail.json()["items"]) == 0


# ── 11. Batch delete items ──────────────────────────────────────

async def test_batch_delete_items(client, auth_headers):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Batch Delete List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    items_resp = await client.post(
        f"/api/lists/{list_id}/items",
        json=[{"name": "A"}, {"name": "B"}, {"name": "C"}],
        headers=auth_headers,
    )
    items = items_resp.json()
    ids_to_delete = [items[0]["id"], items[1]["id"]]

    resp = await client.request(
        "DELETE",
        f"/api/lists/{list_id}/items",
        json={"item_ids": ids_to_delete},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # Verify only "C" remains
    detail = await client.get(
        f"/api/lists/{list_id}",
        headers=auth_headers,
    )
    remaining = detail.json()["items"]
    assert len(remaining) == 1
    assert remaining[0]["name"] == "C"


# ── 12. Join list ───────────────────────────────────────────────

async def test_join_list(client, auth_headers, other_auth_headers):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Shared List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    # Other user joins
    resp = await client.post(
        f"/api/lists/{list_id}/join",
        headers=other_auth_headers,
    )
    assert resp.status_code == 200

    # Other user can now access the list
    detail = await client.get(
        f"/api/lists/{list_id}",
        headers=other_auth_headers,
    )
    assert detail.status_code == 200
    assert len(detail.json()["members"]) == 2


# ── 13. Join list idempotent ────────────────────────────────────

async def test_join_list_idempotent(client, auth_headers, other_auth_headers):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Idempotent List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    # Join twice
    resp1 = await client.post(
        f"/api/lists/{list_id}/join",
        headers=other_auth_headers,
    )
    assert resp1.status_code == 200

    resp2 = await client.post(
        f"/api/lists/{list_id}/join",
        headers=other_auth_headers,
    )
    assert resp2.status_code == 200

    # Still only 2 members
    detail = await client.get(
        f"/api/lists/{list_id}",
        headers=auth_headers,
    )
    assert len(detail.json()["members"]) == 2


# ── 14. Leave list ──────────────────────────────────────────────

async def test_leave_list(client, auth_headers, other_auth_headers):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Leave List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    # Other user joins
    await client.post(
        f"/api/lists/{list_id}/join",
        headers=other_auth_headers,
    )

    # Other user leaves
    resp = await client.delete(
        f"/api/lists/{list_id}",
        headers=other_auth_headers,
    )
    assert resp.status_code == 204

    # Other user can no longer access
    get_resp = await client.get(
        f"/api/lists/{list_id}",
        headers=other_auth_headers,
    )
    assert get_resp.status_code == 403

    # Original user still has access, only 1 member
    detail = await client.get(
        f"/api/lists/{list_id}",
        headers=auth_headers,
    )
    assert detail.status_code == 200
    assert len(detail.json()["members"]) == 1


# ── 15. Last member leaving deletes list ────────────────────────

async def test_last_member_leaving_deletes_list(client, auth_headers):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Ephemeral List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    # Leave (last member)
    resp = await client.delete(
        f"/api/lists/{list_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # List should no longer exist (returns 403 since not a member — or 404)
    get_resp = await client.get(
        f"/api/lists/{list_id}",
        headers=auth_headers,
    )
    # After deletion, the list is gone — membership check will fail
    assert get_resp.status_code in (403, 404)


# ── 16. Update list name ────────────────────────────────────────

async def test_update_list_name(client, auth_headers):
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "Old Name"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    resp = await client.put(
        f"/api/lists/{list_id}",
        json={"name": "New Name"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
