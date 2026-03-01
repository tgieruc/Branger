import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.database import Base, get_db
from app.main import app as fastapi_app
from app.config import settings
import app.models  # noqa: F401  -- register models with Base before create_all


@pytest.fixture(autouse=True)
def override_photos_dir(tmp_path):
    original = settings.photos_dir
    settings.photos_dir = tmp_path / "photos"
    settings.photos_dir.mkdir(parents=True, exist_ok=True)
    yield
    settings.photos_dir = original


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
    fastapi_app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()
