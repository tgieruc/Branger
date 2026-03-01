from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import init_db
from app.config import settings
from app.auth.router import router as auth_router
from app.recipes.router import router as recipes_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.photos_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    yield

app = FastAPI(title="Branger", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(recipes_router)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
