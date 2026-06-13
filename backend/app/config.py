"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (parent of app/)
BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    beingai_db_path: Path = Field(
        default=REPO_ROOT / "data" / "beingai.db",
        validation_alias="BEINGAI_DB_PATH",
    )
    beingai_workspace_root: Path = Field(
        default=REPO_ROOT / "data" / "workspaces",
        validation_alias="BEINGAI_WORKSPACE_ROOT",
    )
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        validation_alias="OLLAMA_BASE_URL",
    )
    ollama_model: str = Field(
        default="qwen2.5-coder:7b",
        validation_alias="OLLAMA_MODEL",
    )
    sqlalchemy_echo: bool = Field(default=False, validation_alias="SQLALCHEMY_ECHO")

    @property
    def database_url(self) -> str:
        path = self.beingai_db_path.resolve()
        return f"sqlite:///{path.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
