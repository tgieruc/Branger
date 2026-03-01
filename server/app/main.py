from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.database import init_db
from app.config import settings
from app.auth.router import router as auth_router
from app.recipes.router import router as recipes_router
from app.share.router import router as share_router
from app.lists.router import router as lists_router
from app.ws.router import router as ws_router
from app.parse.router import router as parse_router
from app.photos.router import router as photos_router
from app.admin.router import router as admin_router

static_dir = Path(__file__).parent.parent / "static"

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.photos_dir.mkdir(parents=True, exist_ok=True)
    # Mount static files for photo serving after ensuring directory exists
    app.mount("/photos", StaticFiles(directory=settings.photos_dir), name="photos")
    await init_db()
    yield

app = FastAPI(title="Branger", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(recipes_router)
app.include_router(share_router)
app.include_router(lists_router)
app.include_router(ws_router)
app.include_router(parse_router)
app.include_router(photos_router)
app.include_router(admin_router)

@app.get("/api/health")
async def health():
    return {"status": "ok"}

# ── SPA catch-all (serves Expo web build from server/static/) ────
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")
