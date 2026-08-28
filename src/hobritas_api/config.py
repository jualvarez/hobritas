from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="APP_",
        extra="ignore",
    )

    database_url: str = "sqlite:///./data/hobritas.db"
    timezone: str = "America/Argentina/Buenos_Aires"
    base_path: str = ""
    version: str = "0.1.0"
    web_dir: Path = Path(__file__).resolve().parents[2] / "web"
    session_hours: int = 12
    cookie_secure: bool = True
    workday_hours: int = 8
    login_max_attempts: int = Field(default=5, gt=0)
    login_window_seconds: int = Field(default=300, gt=0)
    testing: bool = False

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as error:
            raise ValueError("Invalid timezone") from error
        return value

    @field_validator("base_path")
    @classmethod
    def valid_base_path(cls, value: str) -> str:
        if value == "":
            return value
        if not value.startswith("/") or value.endswith("/"):
            raise ValueError("Base path must start with '/' and must not end with '/'")
        return value
