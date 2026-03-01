from contextlib import asynccontextmanager
from fastapi import FastAPI
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

@app.get("/api/health")
async def health():
    return {"status": "ok"}
