from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="APP_",
        extra="ignore",
    )

    database_url: str = "sqlite:///./data/palita.db"
    timezone: str = "America/Argentina/Buenos_Aires"
    session_secret: SecretStr
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
            raise ValueError("Zona horaria inválida") from error
        return value
