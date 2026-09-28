from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    data_dir: Path = ROOT / "data"
    model_dir: Path = ROOT / "backend" / "models"
    model_path: str = ""
    database_url: str = f"sqlite:///{ROOT / 'data' / 'dronevision.db'}"
    device: str = "auto"
    api_key: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"
    max_upload_mb: int = 500
    max_model_mb: int = 250
    allow_pt_upload: bool = False
    enable_rtsp: bool = False
    rtsp_allowed_hosts: str = ""
    confidence_threshold: float = 0.60
    iou_threshold: float = 0.45
    max_session_frames: int = 100000
    max_recording_mb: int = 2048
    telemetry_ttl_seconds: float = 5
    max_frame_bytes: int = 2_000_000


config = Config()
for folder in ["videos", "sessions", "exports", "telemetry"]:
    (config.data_dir / folder).mkdir(parents=True, exist_ok=True)
config.model_dir.mkdir(parents=True, exist_ok=True)
