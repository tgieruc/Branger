from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import init_db
from app.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.photos_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    yield

app = FastAPI(title="Branger", lifespan=lifespan)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
