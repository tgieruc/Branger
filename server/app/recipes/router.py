from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


@router.get("/")
async def list_recipes(user: User = Depends(get_current_user)):
    return []
