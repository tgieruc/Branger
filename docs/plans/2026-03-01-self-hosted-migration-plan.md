# Self-Hosted Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Supabase with a self-hosted Python/FastAPI + SQLite backend, distributed as a single Docker image, with full feature parity including web app.

**Architecture:** Single Docker image running FastAPI (uvicorn) serving REST API, WebSocket, Expo web build, and photo storage. SQLite database. Built-in auth (bcrypt + HS256 JWT). Mistral API proxied through backend.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy (async + aiosqlite), bcrypt, PyJWT, httpx, uvicorn, pytest + httpx (testing), Docker + s6-overlay

**Approach:** TDD — write tests first as regression specs from known features, then implement to make them pass.

**Design doc:** `docs/plans/2026-03-01-self-hosted-migration-design.md`

---

## Phase 1: Backend Project Scaffolding

### Task 1: Initialize Python project structure

**Files:**
- Create: `server/requirements.txt`
- Create: `server/app/__init__.py`
- Create: `server/app/main.py`
- Create: `server/app/config.py`
- Create: `server/app/database.py`
- Create: `server/tests/__init__.py`
- Create: `server/tests/conftest.py`
- Create: `server/pyproject.toml`

**Step 1: Create directory structure**

```bash
mkdir -p server/app/auth server/app/recipes server/app/lists server/app/parse server/app/photos server/app/admin server/app/ws server/tests
touch server/app/__init__.py server/app/auth/__init__.py server/app/recipes/__init__.py server/app/lists/__init__.py server/app/parse/__init__.py server/app/photos/__init__.py server/app/admin/__init__.py server/app/ws/__init__.py server/tests/__init__.py
```

**Step 2: Create requirements.txt**

```
# server/requirements.txt
fastapi==0.115.12
uvicorn[standard]==0.34.2
sqlalchemy[asyncio]==2.0.40
aiosqlite==0.21.0
bcrypt==4.3.0
PyJWT==2.10.1
python-multipart==0.0.20
httpx==0.28.1
pydantic-settings==2.8.1
websockets==15.0.1

# dev
pytest==8.3.5
pytest-asyncio==0.25.3
httpx==0.28.1
```

**Step 3: Create pyproject.toml**

```toml
# server/pyproject.toml
[project]
name = "branger-server"
version = "0.1.0"
requires-python = ">=3.12"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

**Step 4: Create config.py**

```python
# server/app/config.py
from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///data/branger.db"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    mistral_api_key: str = ""
    data_dir: Path = Path("data")
    photos_dir: Path = Path("data/photos")

    model_config = {"env_prefix": ""}

settings = Settings()
```

**Step 5: Create database.py**

```python
# server/app/database.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

**Step 6: Create main.py (minimal)**

```python
# server/app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
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
```

**Step 7: Create test conftest.py**

```python
# server/tests/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.database import Base, get_db
from app.main import app

@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()

@pytest.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
```

**Step 8: Verify setup**

Run: `cd server && pip install -r requirements.txt && python -m pytest tests/ -v`
Expected: 0 tests collected, no errors

**Step 9: Commit**

```bash
git add server/
git commit -m "feat(server): initialize FastAPI project structure"
```

---

## Phase 2: Database Models

### Task 2: Create SQLAlchemy models

**Files:**
- Create: `server/app/models.py`
- Create: `server/tests/test_models.py`

**Step 1: Write the failing test**

```python
# server/tests/test_models.py
import pytest
from sqlalchemy import select
from app.models import User, Recipe, RecipeIngredient, RecipeStep, ShoppingList, ListMember, ListItem, RefreshToken

async def test_create_user(db_session):
    user = User(email="test@example.com", password_hash="hashed")
    db_session.add(user)
    await db_session.commit()
    result = await db_session.execute(select(User).where(User.email == "test@example.com"))
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

    ing = RecipeIngredient(recipe_id=recipe.id, name="Spaghetti", description="500g", position=0)
    step = RecipeStep(recipe_id=recipe.id, step_number=1, instruction="Boil water")
    db_session.add_all([ing, step])
    await db_session.commit()

    result = await db_session.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
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

    result = await db_session.execute(select(ListItem).where(ListItem.list_id == shopping_list.id))
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
```

**Step 2: Run test to verify it fails**

Run: `cd server && python -m pytest tests/test_models.py -v`
Expected: FAIL (ImportError — models don't exist yet)

**Step 3: Write models.py**

```python
# server/app/models.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, ForeignKey, Text, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def generate_id() -> str:
    return uuid.uuid4().hex

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_id)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    recipes: Mapped[list["Recipe"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")

class Recipe(Base):
    __tablename__ = "recipes"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    photo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    share_token: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    source_type: Mapped[str] = mapped_column(String, default="manual")
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    servings: Mapped[str | None] = mapped_column(String, nullable=True)
    prep_time: Mapped[str | None] = mapped_column(String, nullable=True)
    cook_time: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship(back_populates="recipes")
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(back_populates="recipe", cascade="all, delete-orphan")
    steps: Mapped[list["RecipeStep"]] = relationship(back_populates="recipe", cascade="all, delete-orphan")

class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_id)
    recipe_id: Mapped[str] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    position: Mapped[int] = mapped_column(Integer, default=0)

    recipe: Mapped["Recipe"] = relationship(back_populates="ingredients")

class RecipeStep(Base):
    __tablename__ = "recipe_steps"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_id)
    recipe_id: Mapped[str] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    instruction: Mapped[str] = mapped_column(Text, nullable=False)

    recipe: Mapped["Recipe"] = relationship(back_populates="steps")

class ShoppingList(Base):
    __tablename__ = "shopping_lists"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_id)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    members: Mapped[list["ListMember"]] = relationship(back_populates="shopping_list", cascade="all, delete-orphan")
    items: Mapped[list["ListItem"]] = relationship(back_populates="shopping_list", cascade="all, delete-orphan")

class ListMember(Base):
    __tablename__ = "list_members"
    list_id: Mapped[str] = mapped_column(ForeignKey("shopping_lists.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()

class ListItem(Base):
    __tablename__ = "list_items"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_id)
    list_id: Mapped[str] = mapped_column(ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    checked: Mapped[bool] = mapped_column(Boolean, default=False)
    recipe_id: Mapped[str | None] = mapped_column(ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="items")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")
```

**Step 4: Update conftest.py to import models (so tables are created)**

Add to top of `server/tests/conftest.py`:
```python
import app.models  # noqa: F401 — ensures models are registered with Base
```

**Step 5: Run tests to verify they pass**

Run: `cd server && python -m pytest tests/test_models.py -v`
Expected: All 5 tests PASS

**Step 6: Commit**

```bash
git add server/
git commit -m "feat(server): add SQLAlchemy models for all tables"
```

---

## Phase 3: Authentication

### Task 3: Auth service and registration endpoint

**Files:**
- Create: `server/app/auth/schemas.py`
- Create: `server/app/auth/service.py`
- Create: `server/app/auth/router.py`
- Create: `server/app/auth/dependencies.py`
- Create: `server/tests/test_auth.py`
- Modify: `server/app/main.py` (include router)

**Step 1: Write failing auth tests**

```python
# server/tests/test_auth.py
import pytest
from httpx import AsyncClient

async def test_register_first_user_becomes_admin(client: AsyncClient):
    resp = await client.post("/api/auth/register", json={
        "email": "admin@test.com",
        "password": "password123"
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "admin@test.com"
    assert data["is_admin"] is True

async def test_register_second_user_is_not_admin(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "admin@test.com", "password": "password123"
    })
    resp = await client.post("/api/auth/register", json={
        "email": "user@test.com", "password": "password123"
    })
    assert resp.status_code == 201
    assert resp.json()["is_admin"] is False

async def test_register_duplicate_email_fails(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "admin@test.com", "password": "password123"
    })
    resp = await client.post("/api/auth/register", json={
        "email": "admin@test.com", "password": "different"
    })
    assert resp.status_code == 409

async def test_register_short_password_fails(client: AsyncClient):
    resp = await client.post("/api/auth/register", json={
        "email": "user@test.com", "password": "12345"
    })
    assert resp.status_code == 422

async def test_login_returns_tokens(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "user@test.com", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={
        "email": "user@test.com", "password": "password123"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"

async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "user@test.com", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={
        "email": "user@test.com", "password": "wrong"
    })
    assert resp.status_code == 401

async def test_login_nonexistent_user(client: AsyncClient):
    resp = await client.post("/api/auth/login", json={
        "email": "nobody@test.com", "password": "password123"
    })
    assert resp.status_code == 401

async def test_refresh_token_returns_new_access_token(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "user@test.com", "password": "password123"
    })
    login = await client.post("/api/auth/login", json={
        "email": "user@test.com", "password": "password123"
    })
    refresh_token = login.json()["refresh_token"]
    resp = await client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()

async def test_refresh_with_invalid_token_fails(client: AsyncClient):
    resp = await client.post("/api/auth/refresh", json={
        "refresh_token": "invalid-token"
    })
    assert resp.status_code == 401

async def test_change_password(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "user@test.com", "password": "password123"
    })
    login = await client.post("/api/auth/login", json={
        "email": "user@test.com", "password": "password123"
    })
    token = login.json()["access_token"]
    resp = await client.put("/api/auth/change-password",
        json={"current_password": "password123", "new_password": "newpass123"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    # Verify new password works
    resp2 = await client.post("/api/auth/login", json={
        "email": "user@test.com", "password": "newpass123"
    })
    assert resp2.status_code == 200

async def test_change_password_wrong_current(client: AsyncClient):
    await client.post("/api/auth/register", json={
        "email": "user@test.com", "password": "password123"
    })
    login = await client.post("/api/auth/login", json={
        "email": "user@test.com", "password": "password123"
    })
    token = login.json()["access_token"]
    resp = await client.put("/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "newpass123"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 401

async def test_protected_route_without_token(client: AsyncClient):
    resp = await client.get("/api/recipes/")
    assert resp.status_code == 401

async def test_protected_route_with_invalid_token(client: AsyncClient):
    resp = await client.get("/api/recipes/",
        headers={"Authorization": "Bearer invalid-token"}
    )
    assert resp.status_code == 401
```

**Step 2: Run tests to verify they fail**

Run: `cd server && python -m pytest tests/test_auth.py -v`
Expected: FAIL (imports don't exist)

**Step 3: Implement auth schemas**

```python
# server/app/auth/schemas.py
from pydantic import BaseModel, EmailStr, field_validator

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: str
    email: str
    is_admin: bool
```

**Step 4: Implement auth service**

```python
# server/app/auth/service.py
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User, RefreshToken
from app.config import settings

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())

def create_access_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "email": user.email,
        "is_admin": user.is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")

def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])

async def create_refresh_token(db: AsyncSession, user_id: str) -> str:
    raw_token = secrets.token_urlsafe(64)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    refresh = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(refresh)
    await db.commit()
    return raw_token

async def validate_refresh_token(db: AsyncSession, raw_token: str) -> RefreshToken | None:
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    return result.scalar_one_or_none()

async def register_user(db: AsyncSession, email: str, password: str) -> User:
    # Check if first user
    count_result = await db.execute(select(func.count()).select_from(User))
    is_first = count_result.scalar() == 0

    user = User(
        email=email.lower().strip(),
        password_hash=hash_password(password),
        is_admin=is_first,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower().strip()))
    return result.scalar_one_or_none()
```

**Step 5: Implement auth dependencies**

```python
# server/app/auth/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import User
from app.auth.service import decode_access_token
import jwt

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

async def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
```

**Step 6: Implement auth router**

```python
# server/app/auth/router.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.auth.schemas import (
    RegisterRequest, LoginRequest, RefreshRequest,
    ChangePasswordRequest, TokenResponse, UserResponse,
)
from app.auth.service import (
    register_user, get_user_by_email, verify_password, hash_password,
    create_access_token, create_refresh_token, validate_refresh_token,
)
from app.auth.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=UserResponse, status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        user = await register_user(db, req.email, req.password)
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Email already registered")
    return UserResponse(id=user.id, email=user.email, is_admin=user.is_admin)

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, req.email)
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = create_access_token(user)
    refresh_token = await create_refresh_token(db, user.id)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)

@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_record = await validate_refresh_token(db, req.refresh_token)
    if not token_record:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    # Rotate: revoke old, issue new
    token_record.revoked = True
    await db.commit()
    user = await db.get(User, token_record.user_id)
    access_token = create_access_token(user)
    new_refresh = await create_refresh_token(db, user.id)
    return TokenResponse(access_token=access_token, refresh_token=new_refresh)

@router.put("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    user.password_hash = hash_password(req.new_password)
    await db.commit()
    return {"message": "Password changed"}
```

**Step 7: Wire router into main.py**

Add to `server/app/main.py`:
```python
from app.auth.router import router as auth_router
# After app = FastAPI(...)
app.include_router(auth_router)
```

**Step 8: Add a stub recipes route so auth test for protected routes works**

```python
# server/app/recipes/router.py
from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/api/recipes", tags=["recipes"])

@router.get("/")
async def list_recipes(user: User = Depends(get_current_user)):
    return []
```

Add to `server/app/main.py`:
```python
from app.recipes.router import router as recipes_router
app.include_router(recipes_router)
```

**Step 9: Run tests**

Run: `cd server && python -m pytest tests/test_auth.py -v`
Expected: All 12 tests PASS

**Step 10: Commit**

```bash
git add server/
git commit -m "feat(server): add auth system (register, login, refresh, change password)"
```

---

## Phase 4: Recipe CRUD

### Task 4: Recipe endpoints

**Files:**
- Create: `server/app/recipes/schemas.py`
- Create: `server/app/recipes/service.py`
- Modify: `server/app/recipes/router.py`
- Create: `server/tests/test_recipes.py`

**Step 1: Write failing recipe tests**

```python
# server/tests/test_recipes.py
import pytest
from httpx import AsyncClient

@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict:
    await client.post("/api/auth/register", json={
        "email": "user@test.com", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={
        "email": "user@test.com", "password": "password123"
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
async def other_auth_headers(client: AsyncClient, auth_headers: dict) -> dict:
    """Second user to test ownership isolation."""
    await client.post("/api/auth/register", json={
        "email": "other@test.com", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={
        "email": "other@test.com", "password": "password123"
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

async def test_create_recipe(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/recipes/", json={
        "title": "Pasta Carbonara",
        "ingredients": [{"name": "Spaghetti", "description": "500g", "position": 0}],
        "steps": [{"step_number": 1, "instruction": "Boil water"}],
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Pasta Carbonara"
    assert len(data["ingredients"]) == 1
    assert len(data["steps"]) == 1
    assert data["ingredients"][0]["name"] == "Spaghetti"

async def test_create_recipe_without_title_fails(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/recipes/", json={
        "title": "",
        "ingredients": [],
        "steps": [],
    }, headers=auth_headers)
    assert resp.status_code == 422

async def test_get_recipe(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/recipes/", json={
        "title": "Pasta",
        "ingredients": [{"name": "Pasta", "description": "500g", "position": 0}],
        "steps": [{"step_number": 1, "instruction": "Cook"}],
    }, headers=auth_headers)
    recipe_id = create.json()["id"]
    resp = await client.get(f"/api/recipes/{recipe_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Pasta"
    assert len(resp.json()["ingredients"]) == 1
    assert len(resp.json()["steps"]) == 1

async def test_get_other_users_recipe_returns_404(client: AsyncClient, auth_headers: dict, other_auth_headers: dict):
    create = await client.post("/api/recipes/", json={
        "title": "Secret Recipe", "ingredients": [], "steps": [],
    }, headers=auth_headers)
    recipe_id = create.json()["id"]
    resp = await client.get(f"/api/recipes/{recipe_id}", headers=other_auth_headers)
    assert resp.status_code == 404

async def test_list_recipes_returns_own_only(client: AsyncClient, auth_headers: dict, other_auth_headers: dict):
    await client.post("/api/recipes/", json={
        "title": "My Recipe", "ingredients": [], "steps": [],
    }, headers=auth_headers)
    await client.post("/api/recipes/", json={
        "title": "Other Recipe", "ingredients": [], "steps": [],
    }, headers=other_auth_headers)
    resp = await client.get("/api/recipes/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["recipes"]) == 1
    assert data["recipes"][0]["title"] == "My Recipe"

async def test_update_recipe(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/recipes/", json={
        "title": "Old Title",
        "ingredients": [{"name": "Old Ing", "description": "", "position": 0}],
        "steps": [{"step_number": 1, "instruction": "Old step"}],
    }, headers=auth_headers)
    recipe_id = create.json()["id"]
    resp = await client.put(f"/api/recipes/{recipe_id}", json={
        "title": "New Title",
        "ingredients": [{"name": "New Ing", "description": "fresh", "position": 0}],
        "steps": [{"step_number": 1, "instruction": "New step"}, {"step_number": 2, "instruction": "Step 2"}],
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "New Title"
    assert len(data["ingredients"]) == 1
    assert data["ingredients"][0]["name"] == "New Ing"
    assert len(data["steps"]) == 2

async def test_update_other_users_recipe_returns_404(client: AsyncClient, auth_headers: dict, other_auth_headers: dict):
    create = await client.post("/api/recipes/", json={
        "title": "Mine", "ingredients": [], "steps": [],
    }, headers=auth_headers)
    recipe_id = create.json()["id"]
    resp = await client.put(f"/api/recipes/{recipe_id}", json={
        "title": "Stolen", "ingredients": [], "steps": [],
    }, headers=other_auth_headers)
    assert resp.status_code == 404

async def test_delete_recipe(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/recipes/", json={
        "title": "Delete Me", "ingredients": [], "steps": [],
    }, headers=auth_headers)
    recipe_id = create.json()["id"]
    resp = await client.delete(f"/api/recipes/{recipe_id}", headers=auth_headers)
    assert resp.status_code == 204
    resp2 = await client.get(f"/api/recipes/{recipe_id}", headers=auth_headers)
    assert resp2.status_code == 404

async def test_delete_other_users_recipe_returns_404(client: AsyncClient, auth_headers: dict, other_auth_headers: dict):
    create = await client.post("/api/recipes/", json={
        "title": "Mine", "ingredients": [], "steps": [],
    }, headers=auth_headers)
    recipe_id = create.json()["id"]
    resp = await client.delete(f"/api/recipes/{recipe_id}", headers=other_auth_headers)
    assert resp.status_code == 404

async def test_search_recipes(client: AsyncClient, auth_headers: dict):
    await client.post("/api/recipes/", json={
        "title": "Pasta Carbonara",
        "ingredients": [{"name": "Bacon", "description": "", "position": 0}],
        "steps": [],
    }, headers=auth_headers)
    await client.post("/api/recipes/", json={
        "title": "Green Salad",
        "ingredients": [{"name": "Lettuce", "description": "", "position": 0}],
        "steps": [],
    }, headers=auth_headers)
    # Search by title
    resp = await client.get("/api/recipes/?q=pasta", headers=auth_headers)
    assert len(resp.json()["recipes"]) == 1
    assert resp.json()["recipes"][0]["title"] == "Pasta Carbonara"
    # Search by ingredient
    resp2 = await client.get("/api/recipes/?q=bacon", headers=auth_headers)
    assert len(resp2.json()["recipes"]) == 1

async def test_recipe_pagination(client: AsyncClient, auth_headers: dict):
    for i in range(5):
        await client.post("/api/recipes/", json={
            "title": f"Recipe {i}", "ingredients": [], "steps": [],
        }, headers=auth_headers)
    resp = await client.get("/api/recipes/?limit=2", headers=auth_headers)
    data = resp.json()
    assert len(data["recipes"]) == 2
    assert data["has_more"] is True
    # Fetch next page using cursor
    last = data["recipes"][-1]
    resp2 = await client.get(
        f"/api/recipes/?limit=2&cursor_time={last['created_at']}&cursor_id={last['id']}",
        headers=auth_headers
    )
    data2 = resp2.json()
    assert len(data2["recipes"]) == 2

async def test_share_recipe(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/recipes/", json={
        "title": "Shareable", "ingredients": [], "steps": [],
    }, headers=auth_headers)
    recipe_id = create.json()["id"]
    resp = await client.post(f"/api/recipes/{recipe_id}/share", headers=auth_headers)
    assert resp.status_code == 200
    assert "share_token" in resp.json()
    assert "share_url" in resp.json()

async def test_get_shared_recipe_public(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/recipes/", json={
        "title": "Public Recipe",
        "ingredients": [{"name": "Salt", "description": "1tsp", "position": 0}],
        "steps": [{"step_number": 1, "instruction": "Add salt"}],
    }, headers=auth_headers)
    recipe_id = create.json()["id"]
    share = await client.post(f"/api/recipes/{recipe_id}/share", headers=auth_headers)
    token = share.json()["share_token"]
    # Access WITHOUT auth
    resp = await client.get(f"/api/share/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Public Recipe"
    assert len(data["ingredients"]) == 1
    assert len(data["steps"]) == 1
```

**Step 2: Run tests to verify they fail**

Run: `cd server && python -m pytest tests/test_recipes.py -v`
Expected: FAIL

**Step 3: Implement recipe schemas**

```python
# server/app/recipes/schemas.py
from pydantic import BaseModel, field_validator

class IngredientIn(BaseModel):
    name: str
    description: str = ""
    position: int = 0

class StepIn(BaseModel):
    step_number: int
    instruction: str

class RecipeCreate(BaseModel):
    title: str
    ingredients: list[IngredientIn] = []
    steps: list[StepIn] = []
    photo_url: str | None = None
    source_type: str = "manual"
    source_url: str | None = None
    servings: str | None = None
    prep_time: str | None = None
    cook_time: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be empty")
        return v.strip()

class RecipeUpdate(RecipeCreate):
    pass

class IngredientOut(BaseModel):
    id: str
    name: str
    description: str
    position: int

class StepOut(BaseModel):
    id: str
    step_number: int
    instruction: str

class RecipeOut(BaseModel):
    id: str
    title: str
    photo_url: str | None
    share_token: str | None
    source_type: str
    source_url: str | None
    servings: str | None
    prep_time: str | None
    cook_time: str | None
    created_at: str
    updated_at: str
    ingredients: list[IngredientOut] = []
    steps: list[StepOut] = []

class RecipeListOut(BaseModel):
    recipes: list[RecipeOut]
    has_more: bool

class ShareOut(BaseModel):
    share_token: str
    share_url: str
```

**Step 4: Implement recipe service**

```python
# server/app/recipes/service.py
import uuid
from sqlalchemy import select, delete, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models import Recipe, RecipeIngredient, RecipeStep

async def create_recipe(db: AsyncSession, user_id: str, data: dict) -> Recipe:
    recipe = Recipe(
        user_id=user_id,
        title=data["title"],
        photo_url=data.get("photo_url"),
        source_type=data.get("source_type", "manual"),
        source_url=data.get("source_url"),
        servings=data.get("servings"),
        prep_time=data.get("prep_time"),
        cook_time=data.get("cook_time"),
    )
    db.add(recipe)
    await db.flush()

    for ing_data in data.get("ingredients", []):
        db.add(RecipeIngredient(recipe_id=recipe.id, **ing_data))
    for step_data in data.get("steps", []):
        db.add(RecipeStep(recipe_id=recipe.id, **step_data))

    await db.commit()
    return await get_recipe(db, recipe.id, user_id)

async def get_recipe(db: AsyncSession, recipe_id: str, user_id: str) -> Recipe | None:
    result = await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .where(Recipe.id == recipe_id, Recipe.user_id == user_id)
    )
    return result.scalar_one_or_none()

async def get_shared_recipe(db: AsyncSession, share_token: str) -> Recipe | None:
    result = await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .where(Recipe.share_token == share_token)
    )
    return result.scalar_one_or_none()

async def list_recipes(
    db: AsyncSession, user_id: str, query: str | None = None,
    limit: int = 20, cursor_time: str | None = None, cursor_id: str | None = None,
) -> tuple[list[Recipe], bool]:
    limit = max(1, min(limit, 100))
    stmt = (
        select(Recipe)
        .options(selectinload(Recipe.ingredients))
        .where(Recipe.user_id == user_id)
    )
    if query:
        q = f"%{query.lower()}%"
        # Search by title or ingredient name (subquery)
        ingredient_recipe_ids = select(RecipeIngredient.recipe_id).where(
            func.lower(RecipeIngredient.name).like(q)
        ).scalar_subquery()
        stmt = stmt.where(
            or_(func.lower(Recipe.title).like(q), Recipe.id.in_(ingredient_recipe_ids))
        )
    if cursor_time and cursor_id:
        stmt = stmt.where(
            or_(
                Recipe.created_at < cursor_time,
                (Recipe.created_at == cursor_time) & (Recipe.id < cursor_id),
            )
        )
    stmt = stmt.order_by(Recipe.created_at.desc(), Recipe.id.desc()).limit(limit + 1)
    result = await db.execute(stmt)
    recipes = list(result.scalars().all())
    has_more = len(recipes) > limit
    return recipes[:limit], has_more

async def update_recipe(db: AsyncSession, recipe_id: str, user_id: str, data: dict) -> Recipe | None:
    recipe = await get_recipe(db, recipe_id, user_id)
    if not recipe:
        return None
    recipe.title = data["title"]
    recipe.photo_url = data.get("photo_url")
    recipe.source_type = data.get("source_type", recipe.source_type)
    recipe.source_url = data.get("source_url")
    recipe.servings = data.get("servings")
    recipe.prep_time = data.get("prep_time")
    recipe.cook_time = data.get("cook_time")

    # Replace ingredients and steps
    await db.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id))
    await db.execute(delete(RecipeStep).where(RecipeStep.recipe_id == recipe_id))
    for ing_data in data.get("ingredients", []):
        db.add(RecipeIngredient(recipe_id=recipe_id, **ing_data))
    for step_data in data.get("steps", []):
        db.add(RecipeStep(recipe_id=recipe_id, **step_data))

    await db.commit()
    return await get_recipe(db, recipe_id, user_id)

async def delete_recipe(db: AsyncSession, recipe_id: str, user_id: str) -> bool:
    recipe = await get_recipe(db, recipe_id, user_id)
    if not recipe:
        return False
    await db.delete(recipe)
    await db.commit()
    return True

async def generate_share_token(db: AsyncSession, recipe_id: str, user_id: str) -> str | None:
    recipe = await get_recipe(db, recipe_id, user_id)
    if not recipe:
        return None
    if not recipe.share_token:
        recipe.share_token = uuid.uuid4().hex
        await db.commit()
    return recipe.share_token
```

**Step 5: Implement recipe router**

```python
# server/app/recipes/router.py
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import User
from app.recipes.schemas import (
    RecipeCreate, RecipeUpdate, RecipeOut, RecipeListOut,
    IngredientOut, StepOut, ShareOut,
)
from app.recipes.service import (
    create_recipe, get_recipe, list_recipes, update_recipe,
    delete_recipe, generate_share_token, get_shared_recipe,
)

router = APIRouter(prefix="/api/recipes", tags=["recipes"])

def recipe_to_out(recipe) -> RecipeOut:
    return RecipeOut(
        id=recipe.id, title=recipe.title, photo_url=recipe.photo_url,
        share_token=recipe.share_token, source_type=recipe.source_type,
        source_url=recipe.source_url, servings=recipe.servings,
        prep_time=recipe.prep_time, cook_time=recipe.cook_time,
        created_at=recipe.created_at.isoformat(), updated_at=recipe.updated_at.isoformat(),
        ingredients=sorted(
            [IngredientOut(id=i.id, name=i.name, description=i.description, position=i.position) for i in recipe.ingredients],
            key=lambda x: x.position,
        ),
        steps=sorted(
            [StepOut(id=s.id, step_number=s.step_number, instruction=s.instruction) for s in recipe.steps],
            key=lambda x: x.step_number,
        ),
    )

@router.get("/", response_model=RecipeListOut)
async def list_recipes_endpoint(
    q: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    cursor_time: str | None = Query(None),
    cursor_id: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipes, has_more = await list_recipes(db, user.id, q, limit, cursor_time, cursor_id)
    return RecipeListOut(recipes=[recipe_to_out(r) for r in recipes], has_more=has_more)

@router.post("/", response_model=RecipeOut, status_code=201)
async def create_recipe_endpoint(
    req: RecipeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = await create_recipe(db, user.id, req.model_dump())
    return recipe_to_out(recipe)

@router.get("/{recipe_id}", response_model=RecipeOut)
async def get_recipe_endpoint(
    recipe_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = await get_recipe(db, recipe_id, user.id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe_to_out(recipe)

@router.put("/{recipe_id}", response_model=RecipeOut)
async def update_recipe_endpoint(
    recipe_id: str,
    req: RecipeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = await update_recipe(db, recipe_id, user.id, req.model_dump())
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe_to_out(recipe)

@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe_endpoint(
    recipe_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_recipe(db, recipe_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Recipe not found")

@router.post("/{recipe_id}/share", response_model=ShareOut)
async def share_recipe_endpoint(
    recipe_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token = await generate_share_token(db, recipe_id, user.id)
    if not token:
        raise HTTPException(status_code=404, detail="Recipe not found")
    base_url = str(request.base_url).rstrip("/")
    return ShareOut(share_token=token, share_url=f"{base_url}/share/{token}")
```

**Step 6: Add share route (public, no auth)**

Create `server/app/share/__init__.py` and `server/app/share/router.py`:

```python
# server/app/share/router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.recipes.service import get_shared_recipe
from app.recipes.router import recipe_to_out

router = APIRouter(tags=["share"])

@router.get("/api/share/{token}")
async def get_shared_recipe_endpoint(token: str, db: AsyncSession = Depends(get_db)):
    recipe = await get_shared_recipe(db, token)
    if not recipe:
        raise HTTPException(status_code=404, detail="Shared recipe not found")
    return recipe_to_out(recipe)
```

**Step 7: Wire all routers into main.py**

```python
# server/app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import init_db
from app.config import settings
from app.auth.router import router as auth_router
from app.recipes.router import router as recipes_router
from app.share.router import router as share_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.photos_dir.mkdir(parents=True, exist_ok=True)
    await init_db()
    yield

app = FastAPI(title="Branger", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(recipes_router)
app.include_router(share_router)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

**Step 8: Run tests**

Run: `cd server && python -m pytest tests/test_recipes.py -v`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add server/
git commit -m "feat(server): add recipe CRUD, search, pagination, and sharing"
```

---

## Phase 5: Shopping Lists

### Task 5: Shopping list endpoints

**Files:**
- Create: `server/app/lists/schemas.py`
- Create: `server/app/lists/service.py`
- Modify: `server/app/lists/router.py`
- Create: `server/tests/test_lists.py`
- Modify: `server/app/main.py` (include router)

**Step 1: Write failing list tests**

```python
# server/tests/test_lists.py
import pytest
from httpx import AsyncClient
from tests.conftest import create_user_and_login

@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict:
    await client.post("/api/auth/register", json={
        "email": "user@test.com", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={
        "email": "user@test.com", "password": "password123"
    })
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

@pytest.fixture
async def other_auth_headers(client: AsyncClient, auth_headers: dict) -> dict:
    await client.post("/api/auth/register", json={
        "email": "other@test.com", "password": "password123"
    })
    resp = await client.post("/api/auth/login", json={
        "email": "other@test.com", "password": "password123"
    })
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

async def test_create_list(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/lists/", json={"name": "Groceries"}, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Groceries"
    assert len(data["members"]) == 1  # Creator is auto-added

async def test_create_list_empty_name_fails(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/lists/", json={"name": "  "}, headers=auth_headers)
    assert resp.status_code == 422

async def test_list_my_lists(client: AsyncClient, auth_headers: dict, other_auth_headers: dict):
    await client.post("/api/lists/", json={"name": "My List"}, headers=auth_headers)
    await client.post("/api/lists/", json={"name": "Other List"}, headers=other_auth_headers)
    resp = await client.get("/api/lists/", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "My List"

async def test_list_includes_item_counts(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Groceries"}, headers=auth_headers)
    list_id = create.json()["id"]
    await client.post(f"/api/lists/{list_id}/items", json=[
        {"name": "Milk"}, {"name": "Bread"}
    ], headers=auth_headers)
    resp = await client.get("/api/lists/", headers=auth_headers)
    assert resp.json()[0]["item_count"] == 2
    assert resp.json()[0]["unchecked_count"] == 2

async def test_get_list_detail(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Groceries"}, headers=auth_headers)
    list_id = create.json()["id"]
    resp = await client.get(f"/api/lists/{list_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Groceries"
    assert "items" in resp.json()
    assert "members" in resp.json()

async def test_get_list_non_member_returns_403(client: AsyncClient, auth_headers: dict, other_auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Private"}, headers=auth_headers)
    list_id = create.json()["id"]
    resp = await client.get(f"/api/lists/{list_id}", headers=other_auth_headers)
    assert resp.status_code == 403

async def test_add_items_to_list(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Groceries"}, headers=auth_headers)
    list_id = create.json()["id"]
    resp = await client.post(f"/api/lists/{list_id}/items", json=[
        {"name": "Milk"}, {"name": "Bread", "description": "Whole wheat"}
    ], headers=auth_headers)
    assert resp.status_code == 201
    assert len(resp.json()) == 2

async def test_add_items_non_member_returns_403(client: AsyncClient, auth_headers: dict, other_auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Private"}, headers=auth_headers)
    list_id = create.json()["id"]
    resp = await client.post(f"/api/lists/{list_id}/items", json=[
        {"name": "Sneaky Item"}
    ], headers=other_auth_headers)
    assert resp.status_code == 403

async def test_toggle_item(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Groceries"}, headers=auth_headers)
    list_id = create.json()["id"]
    items = await client.post(f"/api/lists/{list_id}/items", json=[
        {"name": "Milk"}
    ], headers=auth_headers)
    item_id = items.json()[0]["id"]
    resp = await client.put(f"/api/lists/{list_id}/items/{item_id}",
        json={"checked": True}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["checked"] is True

async def test_delete_item(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Groceries"}, headers=auth_headers)
    list_id = create.json()["id"]
    items = await client.post(f"/api/lists/{list_id}/items", json=[
        {"name": "Milk"}
    ], headers=auth_headers)
    item_id = items.json()[0]["id"]
    resp = await client.delete(f"/api/lists/{list_id}/items/{item_id}", headers=auth_headers)
    assert resp.status_code == 204

async def test_batch_delete_items(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Groceries"}, headers=auth_headers)
    list_id = create.json()["id"]
    items = await client.post(f"/api/lists/{list_id}/items", json=[
        {"name": "Milk"}, {"name": "Bread"}, {"name": "Eggs"}
    ], headers=auth_headers)
    ids_to_delete = [items.json()[0]["id"], items.json()[1]["id"]]
    resp = await client.delete(f"/api/lists/{list_id}/items",
        json={"item_ids": ids_to_delete}, headers=auth_headers)
    assert resp.status_code == 204
    # Verify only 1 item remains
    detail = await client.get(f"/api/lists/{list_id}", headers=auth_headers)
    assert len(detail.json()["items"]) == 1

async def test_join_list(client: AsyncClient, auth_headers: dict, other_auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Shared"}, headers=auth_headers)
    list_id = create.json()["id"]
    resp = await client.post(f"/api/lists/{list_id}/join", headers=other_auth_headers)
    assert resp.status_code == 200
    # Other user can now access
    detail = await client.get(f"/api/lists/{list_id}", headers=other_auth_headers)
    assert detail.status_code == 200
    assert len(detail.json()["members"]) == 2

async def test_join_list_idempotent(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Mine"}, headers=auth_headers)
    list_id = create.json()["id"]
    resp = await client.post(f"/api/lists/{list_id}/join", headers=auth_headers)
    assert resp.status_code == 200

async def test_leave_list(client: AsyncClient, auth_headers: dict, other_auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Shared"}, headers=auth_headers)
    list_id = create.json()["id"]
    await client.post(f"/api/lists/{list_id}/join", headers=other_auth_headers)
    resp = await client.delete(f"/api/lists/{list_id}", headers=other_auth_headers)
    assert resp.status_code == 204
    # Other user can no longer access
    detail = await client.get(f"/api/lists/{list_id}", headers=other_auth_headers)
    assert detail.status_code == 403

async def test_last_member_leaving_deletes_list(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Solo"}, headers=auth_headers)
    list_id = create.json()["id"]
    await client.delete(f"/api/lists/{list_id}", headers=auth_headers)
    # List should no longer exist
    resp = await client.get(f"/api/lists/{list_id}", headers=auth_headers)
    assert resp.status_code == 403  # or 404 — either is fine since list is gone

async def test_update_list_name(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Old Name"}, headers=auth_headers)
    list_id = create.json()["id"]
    resp = await client.put(f"/api/lists/{list_id}", json={"name": "New Name"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
```

**Step 2: Run tests to verify they fail**

Run: `cd server && python -m pytest tests/test_lists.py -v`
Expected: FAIL

**Step 3: Implement list schemas, service, and router**

_(Follow same pattern as recipes — schemas.py, service.py, router.py. Implementation should handle: create list + auto-add member, membership checks on all operations, item CRUD, batch add/delete, join/leave with auto-delete on last member leave.)_

Key service functions:
- `create_list(db, user_id, name)` — creates list + adds member
- `get_user_lists(db, user_id)` — returns lists with item counts
- `get_list_detail(db, list_id, user_id)` — returns list + items + members (checks membership)
- `is_member(db, list_id, user_id)` — membership check
- `add_items(db, list_id, items)` — batch add with auto-positioning
- `update_item(db, item_id, data)` — toggle checked, rename
- `delete_item(db, item_id)` — single delete
- `batch_delete_items(db, item_ids)` — batch delete
- `join_list(db, list_id, user_id)` — idempotent join
- `leave_list(db, list_id, user_id)` — leave + auto-delete if last member
- `update_list(db, list_id, name)` — rename

**Step 4: Wire router and run tests**

Run: `cd server && python -m pytest tests/test_lists.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add server/
git commit -m "feat(server): add shopping list CRUD, membership, items, join/leave"
```

---

## Phase 6: WebSocket Realtime

### Task 6: WebSocket manager and list item broadcasting

**Files:**
- Create: `server/app/ws/manager.py`
- Create: `server/app/ws/router.py`
- Create: `server/tests/test_ws.py`
- Modify: `server/app/lists/router.py` (broadcast on mutations)
- Modify: `server/app/main.py` (include ws router)

**Step 1: Write failing WebSocket tests**

```python
# server/tests/test_ws.py
import pytest
import json
from httpx import AsyncClient

async def test_ws_connect_requires_auth(client: AsyncClient):
    """WebSocket without token should be rejected."""
    from starlette.testclient import TestClient
    from app.main import app
    with TestClient(app) as tc:
        with pytest.raises(Exception):
            tc.websocket_connect("/ws/lists/fake-id")

async def test_ws_receives_item_insert(client: AsyncClient, auth_headers: dict):
    """When an item is added via API, connected WS clients receive INSERT event."""
    # Create list
    create = await client.post("/api/lists/", json={"name": "Test"}, headers=auth_headers)
    list_id = create.json()["id"]
    token = auth_headers["Authorization"].split(" ")[1]

    from starlette.testclient import TestClient
    from app.main import app
    # Note: TestClient uses sync, works for WebSocket testing
    with TestClient(app) as tc:
        with tc.websocket_connect(f"/ws/lists/{list_id}?token={token}") as ws:
            # Add item via API (use sync client since we're in TestClient context)
            resp = tc.post(f"/api/lists/{list_id}/items",
                json=[{"name": "Milk"}],
                headers=auth_headers)
            assert resp.status_code == 201
            # Should receive INSERT event
            data = ws.receive_json()
            assert data["event"] == "INSERT"
            assert data["record"]["name"] == "Milk"

async def test_ws_receives_item_update(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Test"}, headers=auth_headers)
    list_id = create.json()["id"]
    items = await client.post(f"/api/lists/{list_id}/items",
        json=[{"name": "Milk"}], headers=auth_headers)
    item_id = items.json()[0]["id"]
    token = auth_headers["Authorization"].split(" ")[1]

    from starlette.testclient import TestClient
    from app.main import app
    with TestClient(app) as tc:
        with tc.websocket_connect(f"/ws/lists/{list_id}?token={token}") as ws:
            tc.put(f"/api/lists/{list_id}/items/{item_id}",
                json={"checked": True}, headers=auth_headers)
            data = ws.receive_json()
            assert data["event"] == "UPDATE"
            assert data["record"]["checked"] is True

async def test_ws_receives_item_delete(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/lists/", json={"name": "Test"}, headers=auth_headers)
    list_id = create.json()["id"]
    items = await client.post(f"/api/lists/{list_id}/items",
        json=[{"name": "Milk"}], headers=auth_headers)
    item_id = items.json()[0]["id"]
    token = auth_headers["Authorization"].split(" ")[1]

    from starlette.testclient import TestClient
    from app.main import app
    with TestClient(app) as tc:
        with tc.websocket_connect(f"/ws/lists/{list_id}?token={token}") as ws:
            tc.delete(f"/api/lists/{list_id}/items/{item_id}", headers=auth_headers)
            data = ws.receive_json()
            assert data["event"] == "DELETE"
            assert data["record"]["id"] == item_id
```

**Step 2: Implement WebSocket manager**

```python
# server/app/ws/manager.py
import json
from collections import defaultdict
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, list_id: str, websocket: WebSocket):
        await websocket.accept()
        self._connections[list_id].append(websocket)

    def disconnect(self, list_id: str, websocket: WebSocket):
        self._connections[list_id].remove(websocket)
        if not self._connections[list_id]:
            del self._connections[list_id]

    async def broadcast(self, list_id: str, event: str, record: dict):
        message = {"event": event, "record": record}
        dead = []
        for ws in self._connections.get(list_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(list_id, ws)

manager = ConnectionManager()
```

**Step 3: Implement WebSocket router**

```python
# server/app/ws/router.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.ws.manager import manager
from app.auth.service import decode_access_token
from app.database import async_session
from app.lists.service import is_member
import jwt

router = APIRouter()

@router.websocket("/ws/lists/{list_id}")
async def websocket_list(websocket: WebSocket, list_id: str, token: str = Query(...)):
    # Validate JWT
    try:
        payload = decode_access_token(token)
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = payload["sub"]

    # Check membership
    async with async_session() as db:
        if not await is_member(db, list_id, user_id):
            await websocket.close(code=4003, reason="Not a member")
            return

    await manager.connect(list_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        manager.disconnect(list_id, websocket)
```

**Step 4: Add broadcast calls to list item mutations in lists/router.py**

After every item INSERT/UPDATE/DELETE, call:
```python
from app.ws.manager import manager
await manager.broadcast(list_id, "INSERT", item_to_dict(item))
await manager.broadcast(list_id, "UPDATE", item_to_dict(item))
await manager.broadcast(list_id, "DELETE", {"id": item_id})
```

**Step 5: Wire router, run tests, commit**

Run: `cd server && python -m pytest tests/test_ws.py -v`

```bash
git commit -m "feat(server): add WebSocket realtime for shopping list items"
```

---

## Phase 7: Recipe Parsing (Mistral Proxy)

### Task 7: Mistral proxy endpoints

**Files:**
- Create: `server/app/parse/schemas.py`
- Create: `server/app/parse/service.py`
- Create: `server/app/parse/router.py`
- Create: `server/tests/test_parse.py`
- Modify: `server/app/main.py`

**Step 1: Write failing tests (mock Mistral API)**

```python
# server/tests/test_parse.py
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient

@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict:
    await client.post("/api/auth/register", json={"email": "u@t.com", "password": "password123"})
    resp = await client.post("/api/auth/login", json={"email": "u@t.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

MOCK_MISTRAL_RESPONSE = {
    "choices": [{"message": {"content": '{"title":"Pasta","ingredients":[{"name":"Spaghetti","description":"500g"}],"steps":["Boil water","Cook pasta"]}'}}]
}

@patch("app.parse.service.httpx.AsyncClient")
async def test_parse_text(mock_client_cls, client: AsyncClient, auth_headers: dict):
    mock_instance = AsyncMock()
    mock_instance.post.return_value = AsyncMock(status_code=200, json=lambda: MOCK_MISTRAL_RESPONSE)
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_instance

    resp = await client.post("/api/recipes/parse/text",
        json={"text": "Pasta recipe: boil spaghetti"},
        headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Pasta"
    assert len(data["ingredients"]) == 1
    assert len(data["steps"]) == 2

@patch("app.parse.service.httpx.AsyncClient")
async def test_parse_url(mock_client_cls, client: AsyncClient, auth_headers: dict):
    mock_instance = AsyncMock()
    # First call: fetch URL, second call: Mistral API
    mock_instance.get.return_value = AsyncMock(
        status_code=200, text="<html><body>Pasta recipe</body></html>",
        headers={"content-type": "text/html"}, url="https://example.com/recipe"
    )
    mock_instance.post.return_value = AsyncMock(status_code=200, json=lambda: MOCK_MISTRAL_RESPONSE)
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_instance

    resp = await client.post("/api/recipes/parse/url",
        json={"url": "https://example.com/recipe"},
        headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Pasta"

async def test_parse_text_too_long(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/recipes/parse/text",
        json={"text": "x" * 15001},
        headers=auth_headers)
    assert resp.status_code == 422

async def test_parse_url_private_ip_blocked(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/recipes/parse/url",
        json={"url": "http://192.168.1.1/recipe"},
        headers=auth_headers)
    assert resp.status_code == 400

async def test_parse_requires_auth(client: AsyncClient):
    resp = await client.post("/api/recipes/parse/text", json={"text": "test"})
    assert resp.status_code == 401
```

**Step 2: Implement parse service and router**

Port the existing edge function logic (Mistral API calls, SSRF protection, HTML stripping) from:
- `supabase/functions/parse-recipe-text/index.ts`
- `supabase/functions/parse-recipe-url/index.ts`
- `supabase/functions/parse-recipe-photo/index.ts`

Key: use `httpx.AsyncClient` for both URL fetching and Mistral API calls. SSRF protection checks (private IP, DNS rebinding) should be ported from the TypeScript implementation.

**Step 3: Run tests, commit**

```bash
git commit -m "feat(server): add Mistral recipe parsing proxy (text, url, photo)"
```

---

## Phase 8: Photo Storage

### Task 8: Photo upload and serving

**Files:**
- Create: `server/app/photos/router.py`
- Create: `server/tests/test_photos.py`
- Modify: `server/app/main.py`

**Step 1: Write failing tests**

```python
# server/tests/test_photos.py
import pytest
from httpx import AsyncClient
from io import BytesIO

@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict:
    await client.post("/api/auth/register", json={"email": "u@t.com", "password": "password123"})
    resp = await client.post("/api/auth/login", json={"email": "u@t.com", "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

async def test_upload_photo(client: AsyncClient, auth_headers: dict, tmp_path):
    # Create a minimal JPEG-like file
    fake_image = BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    resp = await client.post("/api/photos/upload",
        files={"file": ("test.jpg", fake_image, "image/jpeg")},
        headers=auth_headers)
    assert resp.status_code == 201
    assert "url" in resp.json()
    assert "/photos/" in resp.json()["url"]

async def test_upload_requires_auth(client: AsyncClient):
    fake_image = BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
    resp = await client.post("/api/photos/upload",
        files={"file": ("test.jpg", fake_image, "image/jpeg")})
    assert resp.status_code == 401
```

**Step 2: Implement photo router**

```python
# server/app/photos/router.py
import time
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Request
from app.auth.dependencies import get_current_user
from app.models import User
from app.config import settings

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
    content = await file.read()
    filepath.write_bytes(content)
    base_url = str(request.base_url).rstrip("/")
    url = f"{base_url}/photos/{user.id}/{filename}"
    return {"url": url}
```

Mount static photos directory in main.py:
```python
from fastapi.staticfiles import StaticFiles
app.mount("/photos", StaticFiles(directory=settings.photos_dir), name="photos")
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat(server): add photo upload and static serving"
```

---

## Phase 9: Admin

### Task 9: Admin password reset

**Files:**
- Create: `server/app/admin/router.py`
- Create: `server/tests/test_admin.py`
- Modify: `server/app/main.py`

**Step 1: Write failing tests**

```python
# server/tests/test_admin.py
import pytest
from httpx import AsyncClient

async def test_admin_reset_password(client: AsyncClient):
    # Register admin (first user)
    await client.post("/api/auth/register", json={"email": "admin@t.com", "password": "password123"})
    login = await client.post("/api/auth/login", json={"email": "admin@t.com", "password": "password123"})
    admin_token = login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Register regular user
    reg = await client.post("/api/auth/register", json={"email": "user@t.com", "password": "old_pass"})
    user_id = reg.json()["id"]

    # Admin resets user's password
    resp = await client.put(f"/api/admin/users/{user_id}/reset-password",
        json={"new_password": "new_pass123"}, headers=admin_headers)
    assert resp.status_code == 200

    # User can login with new password
    login2 = await client.post("/api/auth/login", json={"email": "user@t.com", "password": "new_pass123"})
    assert login2.status_code == 200

async def test_non_admin_cannot_reset_password(client: AsyncClient):
    await client.post("/api/auth/register", json={"email": "admin@t.com", "password": "password123"})
    await client.post("/api/auth/register", json={"email": "user@t.com", "password": "password123"})
    login = await client.post("/api/auth/login", json={"email": "user@t.com", "password": "password123"})
    user_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.put("/api/admin/users/some-id/reset-password",
        json={"new_password": "hacked"}, headers=user_headers)
    assert resp.status_code == 403
```

**Step 2: Implement admin router**

```python
# server/app/admin/router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth.dependencies import get_admin_user
from app.auth.service import hash_password
from app.models import User

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.put("/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: str,
    body: dict,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(body["new_password"])
    await db.commit()
    return {"message": "Password reset"}
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat(server): add admin password reset endpoint"
```

---

## Phase 10: CLI

### Task 10: CLI password reset command

**Files:**
- Create: `server/cli.py`
- Create: `server/tests/test_cli.py`

**Step 1: Write test**

```python
# server/tests/test_cli.py
import pytest
from unittest.mock import patch, AsyncMock

@patch("cli.async_session")
@patch("cli.get_user_by_email")
@patch("cli.hash_password")
async def test_reset_password_cli(mock_hash, mock_get_user, mock_session):
    from cli import reset_password_command
    mock_user = AsyncMock()
    mock_user.email = "user@test.com"
    mock_get_user.return_value = mock_user
    mock_hash.return_value = "new_hash"

    await reset_password_command("user@test.com", "newpass123")
    mock_hash.assert_called_once_with("newpass123")
```

**Step 2: Implement CLI**

```python
# server/cli.py
import asyncio
import sys
from app.database import async_session
from app.auth.service import get_user_by_email, hash_password

async def reset_password_command(email: str, new_password: str):
    async with async_session() as db:
        user = await get_user_by_email(db, email)
        if not user:
            print(f"User {email} not found")
            sys.exit(1)
        user.password_hash = hash_password(new_password)
        await db.commit()
        print(f"Password reset for {email}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python cli.py reset-password <email>")
        sys.exit(1)
    if sys.argv[1] == "reset-password":
        email = sys.argv[2]
        password = input("New password: ")
        asyncio.run(reset_password_command(email, password))
```

**Step 3: Commit**

```bash
git commit -m "feat(server): add CLI password reset command"
```

---

## Phase 11: Docker

### Task 11: Dockerfile and docker-compose

**Files:**
- Create: `server/Dockerfile`
- Create: `docker-compose.yml`

**Step 1: Create Dockerfile**

```dockerfile
# server/Dockerfile
FROM python:3.12-slim

# Install s6-overlay
ADD https://github.com/just-containers/s6-overlay/releases/latest/download/s6-overlay-noarch.tar.xz /tmp
ADD https://github.com/just-containers/s6-overlay/releases/latest/download/s6-overlay-x86_64.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz && \
    tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz && \
    rm /tmp/s6-overlay-*.tar.xz

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Copy Expo web build (built separately, placed in web-build/)
# COPY --from=web-builder /app/web-build /app/static

ENV S6_KEEP_ENV=1
ENV DATA_DIR=/data

EXPOSE 8080

ENTRYPOINT ["/init"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Step 2: Create docker-compose.yml**

```yaml
# docker-compose.yml
services:
  branger:
    build: ./server
    ports:
      - "8080:8080"
    volumes:
      - branger-data:/data
    environment:
      - SECRET_KEY=${SECRET_KEY:-change-me}
      - MISTRAL_API_KEY=${MISTRAL_API_KEY}
    restart: unless-stopped

volumes:
  branger-data:
```

**Step 3: Verify build**

Run: `cd server && docker build -t branger-test .`
Expected: Build succeeds

**Step 4: Commit**

```bash
git commit -m "feat(server): add Dockerfile and docker-compose"
```

---

## Phase 12: Frontend — API Client

### Task 12: Replace Supabase client with generic API client

**Files:**
- Create: `src/lib/api.ts` (replaces `src/lib/supabase.ts`)
- Modify: `src/lib/types.ts` (remove Supabase dependency)

**Step 1: Write failing test**

```typescript
// src/lib/__tests__/api.test.ts
// Tests for the new API client that replaces Supabase
describe('API Client', () => {
  it('adds auth header to requests', async () => {
    // Mock fetch, verify Authorization header is set
  });
  it('auto-refreshes token when expired', async () => {
    // Mock expired token, verify refresh is called
  });
  it('throws on 401 after refresh fails', async () => {
    // Verify auth error propagation
  });
});
```

**Step 2: Implement API client**

```typescript
// src/lib/api.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = '@server_url';
const ACCESS_TOKEN_KEY = '@access_token';
const REFRESH_TOKEN_KEY = '@refresh_token';

let serverUrl = '';

export async function getServerUrl(): Promise<string> {
  if (!serverUrl) {
    serverUrl = await AsyncStorage.getItem(SERVER_URL_KEY) || '';
  }
  return serverUrl;
}

export async function setServerUrl(url: string): Promise<void> {
  serverUrl = url.replace(/\/$/, '');
  await AsyncStorage.setItem(SERVER_URL_KEY, serverUrl);
}

export async function apiCall(
  path: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<Response> {
  const base = await getServerUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (requireAuth) {
    let token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    // Check if token needs refresh (decode JWT exp)
    if (token && isTokenExpiringSoon(token)) {
      token = await refreshAccessToken();
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const resp = await fetch(`${base}${path}`, { ...options, headers });

  if (resp.status === 401 && requireAuth) {
    // Try refresh once
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      return fetch(`${base}${path}`, { ...options, headers });
    }
  }

  return resp;
}

function isTokenExpiringSoon(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp - Date.now() / 1000 < 60;
  } catch {
    return true;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;
  const base = await getServerUrl();
  const resp = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  return data.access_token;
}

export async function storeTokens(access: string, refresh: string) {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, access);
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export async function clearTokens() {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat(frontend): add generic API client replacing Supabase client"
```

---

## Phase 13: Frontend — Auth Migration

### Task 13: Migrate auth context from Supabase to API client

**Files:**
- Modify: `src/lib/auth.tsx`
- Modify: `src/lib/__tests__/auth.test.tsx`
- Modify: `src/app/login.tsx`
- Modify: `src/app/register.tsx`
- Remove: `src/app/forgot-password.tsx` (no longer needed — admin resets)
- Remove: `src/app/reset-password.tsx` (no longer needed)
- Modify: `src/app/(tabs)/settings/change-password.tsx`

**Step 1: Update auth tests to use API client instead of Supabase**

Update `src/lib/__tests__/auth.test.tsx` to mock `apiCall` instead of `supabase.auth.*`.

**Step 2: Migrate auth.tsx**

Replace all `supabase.auth.*` calls with `apiCall('/api/auth/...')` calls. The `AuthProvider` shape stays the same (session, user, loading, signIn, signUp, signOut). Session is now managed by storing JWT tokens in AsyncStorage.

Key changes:
- `signUp` → `apiCall('/api/auth/register', { method: 'POST', body })`
- `signIn` → `apiCall('/api/auth/login', { method: 'POST', body })` → store tokens
- `signOut` → clear tokens + cache
- Session loading: check stored token on startup, decode JWT for user info
- Remove `onAuthStateChange` listener (no longer needed — auth is local)

**Step 3: Migrate login.tsx and register.tsx**

Minimal changes — they already use `useAuth()` hook. Just need to handle the slightly different response shape.

**Step 4: Update change-password.tsx**

Replace `supabase.auth.signInWithPassword` + `supabase.auth.updateUser` with `apiCall('/api/auth/change-password', { method: 'PUT', body })`.

**Step 5: Add server URL setup screen**

Create `src/app/server-setup.tsx` — first screen shown when no server URL is configured. User enters their server URL (like Jellyfin setup).

**Step 6: Run tests, commit**

```bash
git commit -m "feat(frontend): migrate auth from Supabase to self-hosted API"
```

---

## Phase 14: Frontend — Recipe Screens Migration

### Task 14: Migrate recipe screens from Supabase to API

**Files:**
- Modify: `src/app/(tabs)/recipes/index.tsx`
- Modify: `src/app/(tabs)/recipes/[id].tsx`
- Modify: `src/app/(tabs)/recipes/create.tsx`
- Modify: `src/app/(tabs)/recipes/edit/[id].tsx`
- Modify: `src/lib/ai.ts`
- Modify: `src/app/(tabs)/recipes/__tests__/index.test.tsx`

**Step 1: Update recipe index test to mock apiCall instead of supabase.rpc**

**Step 2: Migrate recipes/index.tsx**

Replace:
- `supabase.rpc('search_recipes', {...})` → `apiCall('/api/recipes/?q=...&limit=...&cursor_time=...&cursor_id=...')`

**Step 3: Migrate recipes/[id].tsx**

Replace:
- 3 parallel Supabase queries → single `apiCall('/api/recipes/{id}')` (returns full recipe with ingredients + steps)
- `supabase.from('recipes').delete()` → `apiCall('/api/recipes/{id}', { method: 'DELETE' })`
- `supabase.from('recipes').update({ share_token })` → `apiCall('/api/recipes/{id}/share', { method: 'POST' })`
- Share link: change from `branger://share/${token}` to `${serverUrl}/share/${token}`
- `supabase.rpc('create_list_with_member')` → `apiCall('/api/lists/', { method: 'POST' })`
- `supabase.rpc('add_items_to_list')` → `apiCall('/api/lists/{id}/items', { method: 'POST' })`

**Step 4: Migrate recipes/create.tsx**

Replace:
- `supabase.storage.from('recipe-photos').upload()` → `apiCall('/api/photos/upload', multipart form)`
- `supabase.storage.from('recipe-photos').getPublicUrl()` → use URL from upload response
- `supabase.from('recipes').insert()` + ingredients + steps → single `apiCall('/api/recipes/', { method: 'POST' })`

**Step 5: Migrate recipes/edit/[id].tsx**

Same pattern as create — single API call for full recipe update.

**Step 6: Migrate ai.ts**

Replace edge function calls with API calls:
- `parseRecipeFromText` → `apiCall('/api/recipes/parse/text', { method: 'POST' })`
- `parseRecipeFromUrl` → `apiCall('/api/recipes/parse/url', { method: 'POST' })`
- `parseRecipeFromPhoto(s)` → `apiCall('/api/recipes/parse/photo', { method: 'POST' })`

Remove token refresh logic from ai.ts (apiCall handles it).

**Step 7: Run tests, commit**

```bash
git commit -m "feat(frontend): migrate recipe screens from Supabase to API"
```

---

## Phase 15: Frontend — List Screens Migration

### Task 15: Migrate list screens from Supabase to API

**Files:**
- Modify: `src/app/(tabs)/lists/index.tsx`
- Modify: `src/app/(tabs)/lists/[id].tsx`
- Modify: `src/lib/offline-queue.ts`

**Step 1: Migrate lists/index.tsx**

Replace:
- 3 separate queries (list_members, shopping_lists, list_items) → single `apiCall('/api/lists/')`
- `supabase.rpc('create_list_with_member')` → `apiCall('/api/lists/', { method: 'POST' })`
- `supabase.from('list_members').delete()` → `apiCall('/api/lists/{id}', { method: 'DELETE' })`

**Step 2: Migrate lists/[id].tsx — the most complex screen**

Replace:
- 3 parallel queries → single `apiCall('/api/lists/{id}')`
- Realtime subscription: replace `supabase.channel().on('postgres_changes')` with native WebSocket:

```typescript
const ws = new WebSocket(`${wsUrl}/ws/lists/${id}?token=${accessToken}`);
ws.onmessage = (event) => {
  const { event: evt, record } = JSON.parse(event.data);
  switch (evt) {
    case 'INSERT': setItems(prev => [...prev, record]); break;
    case 'UPDATE': setItems(prev => prev.map(i => i.id === record.id ? record : i)); break;
    case 'DELETE': setItems(prev => prev.filter(i => i.id !== record.id)); break;
  }
};
// Cleanup: ws.close() on unmount
```

- Item mutations:
  - `supabase.from('list_items').update()` → `apiCall('/api/lists/{id}/items/{itemId}', { method: 'PUT' })`
  - `supabase.from('list_items').delete()` → `apiCall('/api/lists/{id}/items/{itemId}', { method: 'DELETE' })`
  - `supabase.from('list_items').insert()` → `apiCall('/api/lists/{id}/items', { method: 'POST' })`
  - Batch delete → `apiCall('/api/lists/{id}/items', { method: 'DELETE', body: { item_ids } })`
- Share link: change from `branger://list/${id}` to `${serverUrl}/list/${id}` (web join page)

**Step 3: Migrate offline-queue.ts**

Replace `supabase.from().insert/update/delete` in `replayQueue()` with `apiCall()`:
```typescript
case 'add_item': await apiCall(`/api/lists/${entry.payload.list_id}/items`, { method: 'POST', body: ... });
case 'delete_item': await apiCall(`/api/lists/${entry.payload.list_id}/items/${entry.payload.itemId}`, { method: 'DELETE' });
case 'toggle_item': await apiCall(`/api/lists/${entry.payload.list_id}/items/${entry.payload.itemId}`, { method: 'PUT', body: ... });
```

**Step 4: Run tests, commit**

```bash
git commit -m "feat(frontend): migrate list screens and offline queue from Supabase to API"
```

---

## Phase 16: Frontend — Share & Join Migration

### Task 16: Migrate share and join screens

**Files:**
- Modify: `src/app/share/[token].tsx`
- Modify: `src/app/list/[id].tsx`

**Step 1: Migrate share/[token].tsx**

Replace:
- `supabase.rpc('get_shared_recipe')` → `apiCall('/api/share/{token}', {}, false)` (no auth)
- "Save to My Recipes": `supabase.from('recipes').insert()` → `apiCall('/api/recipes/', { method: 'POST' })`

**Step 2: Migrate list/[id].tsx**

Replace:
- `supabase.rpc('join_list')` → `apiCall('/api/lists/{id}/join', { method: 'POST' })`

**Step 3: Commit**

```bash
git commit -m "feat(frontend): migrate share and join screens from Supabase to API"
```

---

## Phase 17: Frontend — Cleanup & Web Build

### Task 17: Remove Supabase dependencies and configure web build

**Files:**
- Delete: `src/lib/supabase.ts`
- Delete: `src/lib/database.types.ts`
- Modify: `src/lib/types.ts` (standalone types, no Supabase import)
- Modify: `package.json` (remove `@supabase/supabase-js`)
- Modify: `server/app/main.py` (serve static Expo web build)

**Step 1: Update types.ts to standalone types**

Replace Supabase-derived types with plain TypeScript interfaces matching the API response shapes.

**Step 2: Remove Supabase package**

```bash
npm uninstall @supabase/supabase-js
```

**Step 3: Build Expo web**

```bash
npx expo export --platform web
```

This outputs to `dist/`. Copy to `server/static/` for serving.

**Step 4: Configure FastAPI to serve web build**

```python
# In server/app/main.py — add AFTER all API routes
# Serve Expo web build as SPA (catch-all for non-API routes)
from fastapi.responses import FileResponse
from pathlib import Path

static_dir = Path(__file__).parent.parent / "static"

if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve index.html for all non-API, non-asset routes (SPA routing)
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")
```

**Step 5: Run all tests (backend + frontend)**

```bash
cd server && python -m pytest tests/ -v
cd .. && npm test
```

**Step 6: Commit**

```bash
git commit -m "feat: remove Supabase dependency, configure web build serving"
```

---

## Phase 18: Integration Testing

### Task 18: End-to-end smoke test

**Step 1: Build and run Docker image**

```bash
docker compose up --build -d
```

**Step 2: Run smoke tests**

```bash
# Health check
curl http://localhost:8080/api/health

# Register
curl -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}'

# Login
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}' | jq -r .access_token)

# Create recipe
curl -X POST http://localhost:8080/api/recipes/ \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","ingredients":[],"steps":[]}'

# List recipes
curl http://localhost:8080/api/recipes/ -H "Authorization: Bearer $TOKEN"
```

**Step 3: Verify web app loads**

Open `http://localhost:8080` in browser — should show Expo web app.

**Step 4: Commit final**

```bash
git commit -m "chore: integration test verification complete"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1 | Project scaffolding |
| 2 | 2 | Database models |
| 3 | 3 | Authentication (register, login, refresh, change password) |
| 4 | 4 | Recipe CRUD, search, pagination, sharing |
| 5 | 5 | Shopping lists, membership, items, join/leave |
| 6 | 6 | WebSocket realtime broadcasting |
| 7 | 7 | Mistral recipe parsing proxy |
| 8 | 8 | Photo upload and serving |
| 9 | 9 | Admin password reset |
| 10 | 10 | CLI password reset |
| 11 | 11 | Docker image |
| 12-16 | 12-16 | Frontend migration (API client, auth, recipes, lists, share) |
| 17 | 17 | Cleanup + web build |
| 18 | 18 | Integration testing |

**Total: 18 tasks, TDD throughout backend phases (2-10).**

Each backend task follows: write failing tests → implement → verify pass → commit.
Frontend tasks follow: update tests → migrate code → verify → commit.
