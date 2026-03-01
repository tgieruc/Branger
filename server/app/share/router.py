from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.recipes.schemas import RecipeOut
from app.recipes.service import get_shared_recipe, recipe_to_out

router = APIRouter(prefix="/api/share", tags=["share"])


@router.get("/{token}", response_model=RecipeOut)
async def get_shared_recipe_endpoint(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    recipe = await get_shared_recipe(db, token)
    if recipe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared recipe not found",
        )
    return recipe_to_out(recipe)
