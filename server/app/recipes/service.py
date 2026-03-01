import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Recipe, RecipeIngredient, RecipeStep

from .schemas import RecipeCreate, RecipeOut, RecipeUpdate, IngredientOut, StepOut


def recipe_to_out(recipe: Recipe) -> RecipeOut:
    """Convert a Recipe ORM model to a RecipeOut schema."""
    ingredients = sorted(recipe.ingredients, key=lambda i: i.position)
    steps = sorted(recipe.steps, key=lambda s: s.step_number)
    return RecipeOut(
        id=recipe.id,
        title=recipe.title,
        photo_url=recipe.photo_url,
        share_token=recipe.share_token,
        source_type=recipe.source_type,
        source_url=recipe.source_url,
        servings=recipe.servings,
        prep_time=recipe.prep_time,
        cook_time=recipe.cook_time,
        created_at=recipe.created_at.isoformat(),
        updated_at=recipe.updated_at.isoformat(),
        ingredients=[
            IngredientOut(
                id=ing.id,
                name=ing.name,
                description=ing.description,
                position=ing.position,
            )
            for ing in ingredients
        ],
        steps=[
            StepOut(
                id=step.id,
                step_number=step.step_number,
                instruction=step.instruction,
            )
            for step in steps
        ],
    )


def _eager_options():
    return [selectinload(Recipe.ingredients), selectinload(Recipe.steps)]


async def create_recipe(
    db: AsyncSession, user_id: str, data: RecipeCreate
) -> Recipe:
    recipe = Recipe(
        user_id=user_id,
        title=data.title,
        photo_url=data.photo_url,
        source_type=data.source_type,
        source_url=data.source_url,
        servings=data.servings,
        prep_time=data.prep_time,
        cook_time=data.cook_time,
    )
    db.add(recipe)
    await db.flush()

    for ing_data in data.ingredients:
        ingredient = RecipeIngredient(
            recipe_id=recipe.id,
            name=ing_data.name,
            description=ing_data.description,
            position=ing_data.position,
        )
        db.add(ingredient)

    for step_data in data.steps:
        step = RecipeStep(
            recipe_id=recipe.id,
            step_number=step_data.step_number,
            instruction=step_data.instruction,
        )
        db.add(step)

    await db.flush()

    # Re-fetch with eager loading
    result = await db.execute(
        select(Recipe)
        .options(*_eager_options())
        .where(Recipe.id == recipe.id)
    )
    return result.scalar_one()


async def get_recipe(
    db: AsyncSession, recipe_id: str, user_id: str
) -> Recipe | None:
    result = await db.execute(
        select(Recipe)
        .options(*_eager_options())
        .where(Recipe.id == recipe_id, Recipe.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_shared_recipe(
    db: AsyncSession, share_token: str
) -> Recipe | None:
    result = await db.execute(
        select(Recipe)
        .options(*_eager_options())
        .where(Recipe.share_token == share_token)
    )
    return result.scalar_one_or_none()


async def list_recipes(
    db: AsyncSession,
    user_id: str,
    query: str | None = None,
    limit: int = 20,
    cursor_time: str | None = None,
    cursor_id: str | None = None,
) -> tuple[list[Recipe], bool]:
    stmt = (
        select(Recipe)
        .options(*_eager_options())
        .where(Recipe.user_id == user_id)
    )

    if query:
        pattern = f"%{query}%"
        stmt = stmt.outerjoin(RecipeIngredient).where(
            or_(
                Recipe.title.ilike(pattern),
                RecipeIngredient.name.ilike(pattern),
            )
        ).group_by(Recipe.id)

    # Cursor pagination: created_at DESC, id DESC
    if cursor_time and cursor_id:
        cursor_dt = datetime.fromisoformat(cursor_time)
        stmt = stmt.where(
            or_(
                Recipe.created_at < cursor_dt,
                (Recipe.created_at == cursor_dt) & (Recipe.id < cursor_id),
            )
        )

    stmt = stmt.order_by(Recipe.created_at.desc(), Recipe.id.desc())
    # Fetch one extra to determine has_more
    stmt = stmt.limit(limit + 1)

    result = await db.execute(stmt)
    recipes = list(result.scalars().unique().all())

    has_more = len(recipes) > limit
    if has_more:
        recipes = recipes[:limit]

    return recipes, has_more


async def update_recipe(
    db: AsyncSession, recipe_id: str, user_id: str, data: RecipeUpdate
) -> Recipe | None:
    # Fetch the recipe first
    result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == user_id)
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        return None

    # Update scalar fields
    recipe.title = data.title
    recipe.photo_url = data.photo_url
    recipe.source_type = data.source_type
    recipe.source_url = data.source_url
    recipe.servings = data.servings
    recipe.prep_time = data.prep_time
    recipe.cook_time = data.cook_time

    # Delete old ingredients and steps
    await db.execute(
        delete(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id)
    )
    await db.execute(
        delete(RecipeStep).where(RecipeStep.recipe_id == recipe_id)
    )

    # Insert new ingredients and steps
    for ing_data in data.ingredients:
        ingredient = RecipeIngredient(
            recipe_id=recipe_id,
            name=ing_data.name,
            description=ing_data.description,
            position=ing_data.position,
        )
        db.add(ingredient)

    for step_data in data.steps:
        step = RecipeStep(
            recipe_id=recipe_id,
            step_number=step_data.step_number,
            instruction=step_data.instruction,
        )
        db.add(step)

    await db.flush()

    # Re-fetch with eager loading
    result = await db.execute(
        select(Recipe)
        .options(*_eager_options())
        .where(Recipe.id == recipe_id)
    )
    return result.scalar_one()


async def delete_recipe(
    db: AsyncSession, recipe_id: str, user_id: str
) -> bool:
    result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == user_id)
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        return False
    await db.delete(recipe)
    await db.flush()
    return True


async def generate_share_token(
    db: AsyncSession, recipe_id: str, user_id: str
) -> str | None:
    result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == user_id)
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        return None

    if recipe.share_token is None:
        recipe.share_token = uuid.uuid4().hex
        await db.flush()

    return recipe.share_token
