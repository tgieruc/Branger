from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///data/branger.db"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    mistral_api_key: str = ""
    data_dir: Path = Path("data")

    model_config = {"env_prefix": ""}

    @property
    def photos_dir(self) -> Path:
        return self.data_dir / "photos"

settings = Settings()
