import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _new_id() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------
# Users
# ------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(primary_key=True, default=_new_id)
    email: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    is_admin: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow)

    recipes: Mapped[list["Recipe"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    list_memberships: Mapped[list["ListMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# ------------------------------------------------------------------
# Recipes
# ------------------------------------------------------------------
class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[str] = mapped_column(primary_key=True, default=_new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str]
    photo_url: Mapped[str | None] = mapped_column(default=None)
    share_token: Mapped[str | None] = mapped_column(unique=True, default=None)
    source_type: Mapped[str] = mapped_column(default="manual")
    source_url: Mapped[str | None] = mapped_column(default=None)
    servings: Mapped[str | None] = mapped_column(default=None)
    prep_time: Mapped[str | None] = mapped_column(default=None)
    cook_time: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow)

    user: Mapped["User"] = relationship(back_populates="recipes")
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe", cascade="all, delete-orphan"
    )
    steps: Mapped[list["RecipeStep"]] = relationship(
        back_populates="recipe", cascade="all, delete-orphan"
    )


# ------------------------------------------------------------------
# Recipe ingredients
# ------------------------------------------------------------------
class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[str] = mapped_column(primary_key=True, default=_new_id)
    recipe_id: Mapped[str] = mapped_column(
        ForeignKey("recipes.id", ondelete="CASCADE")
    )
    name: Mapped[str]
    description: Mapped[str] = mapped_column(default="")
    position: Mapped[int] = mapped_column(default=0)

    recipe: Mapped["Recipe"] = relationship(back_populates="ingredients")


# ------------------------------------------------------------------
# Recipe steps
# ------------------------------------------------------------------
class RecipeStep(Base):
    __tablename__ = "recipe_steps"

    id: Mapped[str] = mapped_column(primary_key=True, default=_new_id)
    recipe_id: Mapped[str] = mapped_column(
        ForeignKey("recipes.id", ondelete="CASCADE")
    )
    step_number: Mapped[int]
    instruction: Mapped[str] = mapped_column(Text)

    recipe: Mapped["Recipe"] = relationship(back_populates="steps")


# ------------------------------------------------------------------
# Shopping lists
# ------------------------------------------------------------------
class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id: Mapped[str] = mapped_column(primary_key=True, default=_new_id)
    name: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow)

    members: Mapped[list["ListMember"]] = relationship(
        back_populates="shopping_list", cascade="all, delete-orphan"
    )
    items: Mapped[list["ListItem"]] = relationship(
        back_populates="shopping_list", cascade="all, delete-orphan"
    )


# ------------------------------------------------------------------
# List members (composite PK)
# ------------------------------------------------------------------
class ListMember(Base):
    __tablename__ = "list_members"

    list_id: Mapped[str] = mapped_column(
        ForeignKey("shopping_lists.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(default=_utcnow)

    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="list_memberships")


# ------------------------------------------------------------------
# List items
# ------------------------------------------------------------------
class ListItem(Base):
    __tablename__ = "list_items"

    id: Mapped[str] = mapped_column(primary_key=True, default=_new_id)
    list_id: Mapped[str] = mapped_column(
        ForeignKey("shopping_lists.id", ondelete="CASCADE")
    )
    name: Mapped[str]
    description: Mapped[str | None] = mapped_column(default=None)
    checked: Mapped[bool] = mapped_column(default=False)
    recipe_id: Mapped[str | None] = mapped_column(
        ForeignKey("recipes.id", ondelete="SET NULL"), default=None
    )
    position: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="items")


# ------------------------------------------------------------------
# Refresh tokens
# ------------------------------------------------------------------
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(primary_key=True, default=_new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    revoked: Mapped[bool] = mapped_column(default=False)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")
