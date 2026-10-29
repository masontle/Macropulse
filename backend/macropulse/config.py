from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MACROPULSE_", env_file=ROOT / ".env", extra="ignore"
    )
    data_dir: Path = ROOT / "data"
    context_length: int = Field(default=256, ge=32, le=15360)
    batch_size: int = Field(default=4, ge=1, le=32)
    torch_threads: int = Field(default=4, ge=1, le=32)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def database(self) -> Path:
        return self.data_dir / "research.sqlite3"


settings = Settings()
