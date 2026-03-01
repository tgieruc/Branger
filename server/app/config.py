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
