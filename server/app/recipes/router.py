from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models import User

from .schemas import (
    RecipeCreate,
    RecipeListOut,
    RecipeOut,
    RecipeUpdate,
    ShareOut,
)
from .service import (
    create_recipe,
    delete_recipe,
    generate_share_token,
    get_recipe,
    list_recipes,
    recipe_to_out,
    update_recipe,
)

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


@router.get("/", response_model=RecipeListOut)
async def list_recipes_endpoint(
    q: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    cursor_time: str | None = Query(None),
    cursor_id: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipes, has_more = await list_recipes(
        db, user.id, query=q, limit=limit,
        cursor_time=cursor_time, cursor_id=cursor_id,
    )
    return RecipeListOut(
        recipes=[recipe_to_out(r) for r in recipes],
        has_more=has_more,
    )


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=RecipeOut)
async def create_recipe_endpoint(
    body: RecipeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = await create_recipe(db, user.id, body)
    await db.commit()
    return recipe_to_out(recipe)


@router.get("/{recipe_id}", response_model=RecipeOut)
async def get_recipe_endpoint(
    recipe_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = await get_recipe(db, recipe_id, user.id)
    if recipe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found",
        )
    return recipe_to_out(recipe)


@router.put("/{recipe_id}", response_model=RecipeOut)
async def update_recipe_endpoint(
    recipe_id: str,
    body: RecipeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = await update_recipe(db, recipe_id, user.id, body)
    if recipe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found",
        )
    await db.commit()
    return recipe_to_out(recipe)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recipe_endpoint(
    recipe_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_recipe(db, recipe_id, user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found",
        )
    await db.commit()


@router.post("/{recipe_id}/share", response_model=ShareOut)
async def share_recipe_endpoint(
    recipe_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token = await generate_share_token(db, recipe_id, user.id)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found",
        )
    await db.commit()
    share_url = f"{request.base_url}share/{token}"
    return ShareOut(share_token=token, share_url=share_url)
