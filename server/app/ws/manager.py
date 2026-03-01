from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, list_id: str, websocket: WebSocket):
        await websocket.accept()
        self._connections[list_id].append(websocket)

    def disconnect(self, list_id: str, websocket: WebSocket):
        self._connections[list_id].remove(websocket)
        if not self._connections[list_id]:
            del self._connections[list_id]

    async def broadcast(self, list_id: str, event: str, record: dict):
        message = {"event": event, "record": record}
        dead: list[WebSocket] = []
        for ws in self._connections.get(list_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(list_id, ws)


manager = ConnectionManager()
