import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request

from app.auth.dependencies import get_current_user
from app.models import User
from app.config import settings

MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 10 MB

router = APIRouter(prefix="/api/photos", tags=["photos"])


@router.post("/upload", status_code=201)
async def upload_photo(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    ext = Path(file.filename).suffix or ".jpg"
    filename = f"{int(time.time())}-{uuid.uuid4().hex[:8]}{ext}"
    user_dir = settings.photos_dir / user.id
    user_dir.mkdir(parents=True, exist_ok=True)
    filepath = user_dir / filename
    content = await file.read(MAX_PHOTO_SIZE + 1)
    if len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")
    filepath.write_bytes(content)
    base_url = str(request.base_url).rstrip("/")
    url = f"{base_url}/photos/{user.id}/{filename}"
    return {"url": url}
