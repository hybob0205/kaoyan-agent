from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables or a local .env file."""

    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8003
    cors_origins: str = "http://127.0.0.1:5175,http://localhost:5175"
    jwt_secret: str = "change-me-before-production"
    jwt_expire_minutes: int = 60 * 24 * 7
    database_url: str = ""
    data_root: str = ""
    model_config_secret: str = ""
    serve_frontend: bool = False

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", PROJECT_ROOT / ".run" / "lan-secrets.env"),
        env_file_encoding="utf-8", extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        data_path = PROJECT_ROOT / "data" / "kaoyan.db"
        return f"sqlite:///{data_path}"

    @property
    def resolved_data_root(self) -> Path:
        if self.data_root:
            return Path(self.data_root).expanduser().resolve()
        if self.database_url:
            url = make_url(self.database_url)
            if url.get_backend_name() == "sqlite" and url.database and url.database != ":memory:":
                return Path(url.database).expanduser().resolve().parent
        return PROJECT_ROOT / "data"

    def validate_for_startup(self) -> None:
        if self.app_env.lower() not in {"production", "lan"}:
            return
        if self.jwt_secret == "change-me-before-production" or len(self.jwt_secret) < 32:
            raise ValueError("生产环境必须设置至少 32 字符的 JWT_SECRET")
        if (self.model_config_secret == "change-me-with-a-random-secret"
                or len(self.model_config_secret) < 32
                or self.model_config_secret == self.jwt_secret):
            raise ValueError("生产环境必须设置独立且至少 32 字符的 MODEL_CONFIG_SECRET")
        if "*" in self.cors_origin_list:
            raise ValueError("生产环境的 CORS_ORIGINS 不能使用通配符")


@lru_cache
def get_settings() -> Settings:
    return Settings()
