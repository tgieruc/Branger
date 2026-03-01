import pytest
from unittest.mock import AsyncMock, patch


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
async def auth_headers(client):
    await client.post(
        "/api/auth/register",
        json={"email": "wsuser@test.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"email": "wsuser@test.com", "password": "password123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ── 1. ConnectionManager: connect and broadcast ─────────────────

async def test_manager_connect_and_broadcast():
    from app.ws.manager import ConnectionManager

    mgr = ConnectionManager()
    ws = AsyncMock()
    await mgr.connect("list-1", ws)
    ws.accept.assert_called_once()

    await mgr.broadcast("list-1", "INSERT", {"id": "item-1", "name": "Milk"})
    ws.send_json.assert_called_once_with({
        "event": "INSERT",
        "record": {"id": "item-1", "name": "Milk"},
    })


# ── 2. ConnectionManager: disconnect ────────────────────────────

async def test_manager_disconnect():
    from app.ws.manager import ConnectionManager

    mgr = ConnectionManager()
    ws = AsyncMock()
    await mgr.connect("list-1", ws)
    mgr.disconnect("list-1", ws)

    await mgr.broadcast("list-1", "INSERT", {"id": "item-1", "name": "Milk"})
    assert ws.send_json.call_count == 0  # No broadcast after disconnect


# ── 3. ConnectionManager: removes dead connections ──────────────

async def test_manager_removes_dead_connections():
    from app.ws.manager import ConnectionManager

    mgr = ConnectionManager()
    ws_alive = AsyncMock()
    ws_dead = AsyncMock()
    ws_dead.send_json.side_effect = Exception("connection closed")

    await mgr.connect("list-1", ws_alive)
    await mgr.connect("list-1", ws_dead)

    await mgr.broadcast("list-1", "INSERT", {"id": "item-1", "name": "Milk"})

    # Dead connection should be removed
    assert len(mgr._connections.get("list-1", [])) == 1
    assert ws_alive in mgr._connections["list-1"]


# ── 4. ConnectionManager: broadcasts to correct list ────────────

async def test_manager_broadcasts_to_correct_list():
    from app.ws.manager import ConnectionManager

    mgr = ConnectionManager()
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    await mgr.connect("list-1", ws1)
    await mgr.connect("list-2", ws2)

    await mgr.broadcast("list-1", "INSERT", {"name": "Milk"})
    ws1.send_json.assert_called_once()
    ws2.send_json.assert_not_called()


# ── 5. ConnectionManager: disconnect cleans up empty list ───────

async def test_manager_disconnect_cleans_up_empty_list():
    from app.ws.manager import ConnectionManager

    mgr = ConnectionManager()
    ws = AsyncMock()
    await mgr.connect("list-1", ws)
    mgr.disconnect("list-1", ws)

    # The list key should be removed entirely
    assert "list-1" not in mgr._connections


# ── 6. Broadcast integration: add items triggers broadcast ──────

async def test_add_items_broadcasts(client, auth_headers):
    # Create a list
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "WS Test List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    with patch("app.lists.router.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()

        resp = await client.post(
            f"/api/lists/{list_id}/items",
            json=[{"name": "Milk"}, {"name": "Eggs"}],
            headers=auth_headers,
        )
        assert resp.status_code == 201

        # Should have broadcast INSERT for each item
        assert mock_manager.broadcast.call_count == 2
        calls = mock_manager.broadcast.call_args_list
        assert calls[0].args[0] == list_id
        assert calls[0].args[1] == "INSERT"
        assert calls[0].args[2]["name"] == "Milk"
        assert calls[1].args[0] == list_id
        assert calls[1].args[1] == "INSERT"
        assert calls[1].args[2]["name"] == "Eggs"


# ── 7. Broadcast integration: update item triggers broadcast ────

async def test_update_item_broadcasts(client, auth_headers):
    # Create list + add item
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "WS Update List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    items_resp = await client.post(
        f"/api/lists/{list_id}/items",
        json=[{"name": "Bread"}],
        headers=auth_headers,
    )
    item_id = items_resp.json()[0]["id"]

    with patch("app.lists.router.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()

        resp = await client.put(
            f"/api/lists/{list_id}/items/{item_id}",
            json={"checked": True},
            headers=auth_headers,
        )
        assert resp.status_code == 200

        mock_manager.broadcast.assert_called_once()
        call_args = mock_manager.broadcast.call_args
        assert call_args.args[0] == list_id
        assert call_args.args[1] == "UPDATE"
        assert call_args.args[2]["checked"] is True


# ── 8. Broadcast integration: delete item triggers broadcast ────

async def test_delete_item_broadcasts(client, auth_headers):
    # Create list + add item
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "WS Delete List"},
        headers=auth_headers,
    )
    list_id = create_resp.json()["id"]

    items_resp = await client.post(
        f"/api/lists/{list_id}/items",
        json=[{"name": "Temp"}],
        headers=auth_headers,
    )
    item_id = items_resp.json()[0]["id"]

    with patch("app.lists.router.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()

        resp = await client.delete(
            f"/api/lists/{list_id}/items/{item_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 204

        mock_manager.broadcast.assert_called_once()
        call_args = mock_manager.broadcast.call_args
        assert call_args.args[0] == list_id
        assert call_args.args[1] == "DELETE"
        assert call_args.args[2] == {"id": item_id}


# ── 9. Broadcast integration: batch delete triggers broadcasts ──

async def test_batch_delete_broadcasts(client, auth_headers):
    # Create list + add items
    create_resp = await client.post(
        "/api/lists/",
        json={"name": "WS Batch Delete List"},
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

    with patch("app.lists.router.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()

        resp = await client.request(
            "DELETE",
            f"/api/lists/{list_id}/items",
            json={"item_ids": ids_to_delete},
            headers=auth_headers,
        )
        assert resp.status_code == 204

        # Should broadcast DELETE for each item
        assert mock_manager.broadcast.call_count == 2
        calls = mock_manager.broadcast.call_args_list
        deleted_ids = {c.args[2]["id"] for c in calls}
        assert deleted_ids == set(ids_to_delete)
        for c in calls:
            assert c.args[1] == "DELETE"
