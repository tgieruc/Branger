import pytest
from sqlalchemy import select
from app.models import (
    User,
    Recipe,
    RecipeIngredient,
    RecipeStep,
    ShoppingList,
    ListMember,
    ListItem,
    RefreshToken,
)


async def test_create_user(db_session):
    user = User(email="test@example.com", password_hash="hashed")
    db_session.add(user)
    await db_session.commit()
    result = await db_session.execute(
        select(User).where(User.email == "test@example.com")
    )
    fetched = result.scalar_one()
    assert fetched.id is not None
    assert fetched.email == "test@example.com"
    assert fetched.is_admin is False


async def test_first_user_can_be_admin(db_session):
    user = User(email="admin@example.com", password_hash="hashed", is_admin=True)
    db_session.add(user)
    await db_session.commit()
    result = await db_session.execute(select(User))
    fetched = result.scalar_one()
    assert fetched.is_admin is True


async def test_create_recipe_with_ingredients_and_steps(db_session):
    user = User(email="test@example.com", password_hash="hashed")
    db_session.add(user)
    await db_session.flush()
    recipe = Recipe(user_id=user.id, title="Pasta")
    db_session.add(recipe)
    await db_session.flush()
    ing = RecipeIngredient(
        recipe_id=recipe.id, name="Spaghetti", description="500g", position=0
    )
    step = RecipeStep(recipe_id=recipe.id, step_number=1, instruction="Boil water")
    db_session.add_all([ing, step])
    await db_session.commit()
    result = await db_session.execute(
        select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)
    )
    assert len(result.scalars().all()) == 1


async def test_create_shopping_list_with_members_and_items(db_session):
    user = User(email="test@example.com", password_hash="hashed")
    db_session.add(user)
    await db_session.flush()
    shopping_list = ShoppingList(name="Groceries")
    db_session.add(shopping_list)
    await db_session.flush()
    member = ListMember(list_id=shopping_list.id, user_id=user.id)
    item = ListItem(list_id=shopping_list.id, name="Milk", position=0)
    db_session.add_all([member, item])
    await db_session.commit()
    result = await db_session.execute(
        select(ListItem).where(ListItem.list_id == shopping_list.id)
    )
    assert len(result.scalars().all()) == 1


async def test_cascade_delete_user_deletes_recipes(db_session):
    user = User(email="test@example.com", password_hash="hashed")
    db_session.add(user)
    await db_session.flush()
    recipe = Recipe(user_id=user.id, title="Pasta")
    db_session.add(recipe)
    await db_session.commit()
    await db_session.delete(user)
    await db_session.commit()
    result = await db_session.execute(select(Recipe))
    assert len(result.scalars().all()) == 0
