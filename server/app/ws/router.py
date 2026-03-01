import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.auth.service import decode_access_token
from app.database import async_session
from app.lists.service import is_member
from app.ws.manager import manager

router = APIRouter()


@router.websocket("/ws/lists/{list_id}")
async def websocket_list(
    websocket: WebSocket,
    list_id: str,
    token: str = Query(...),
):
    try:
        payload = decode_access_token(token)
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = payload["sub"]
    async with async_session() as db:
        if not await is_member(db, list_id, user_id):
            await websocket.close(code=4003, reason="Not a member")
            return

    await manager.connect(list_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(list_id, websocket)
