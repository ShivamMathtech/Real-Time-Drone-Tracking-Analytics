import math
from typing import Any, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Settings(StrictModel):
    confidence: float = Field(0.6, ge=0.05, le=1)
    iou: float = Field(0.45, ge=0.1, le=0.95)
    algorithm: Literal["bytetrack", "deepsort"] = "bytetrack"
    mode: Literal["single", "multi"] = "multi"
    auto_tracking: bool = True
    kalman: bool = True
    trail_length: int = Field(100, ge=0, le=500)
    lost_timeout: float = Field(2, ge=0.2, le=15)
    max_objects: int = Field(20, ge=1, le=100)
    fps_limit: int = Field(20, ge=1, le=60)
    processing_width: int = Field(960, ge=320, le=1920)
    frame_skip: int = Field(0, ge=0, le=15)
    telemetry_source: Literal["none", "simulation", "custom"] = "none"
    telemetry_refresh_hz: int = Field(10, ge=1, le=30)
    theme: Literal["dark", "light"] = "dark"
    units: Literal["px"] = "px"
    language: Literal["en"] = "en"
    worker_count: Literal[1] = 1
    device: Literal["auto", "cpu", "cuda"] = "auto"


class SourceRequest(StrictModel):
    kind: Literal["demo", "file", "webcam", "rtsp", "backend_camera"]
    asset_id: str | None = None
    url: str | None = Field(None, max_length=2048)
    camera_index: int = Field(0, ge=0, le=10)


class PlaybackRequest(StrictModel):
    action: Literal["play", "pause", "seek", "speed"]
    value: float = Field(0, ge=0)


class ModelRequest(StrictModel):
    filename: str = Field(min_length=1, max_length=180)


class SaveRequest(StrictModel):
    name: str = Field("Untitled research session", min_length=1, max_length=120)


class RecordRequest(StrictModel):
    enabled: bool


class SelectionRequest(StrictModel):
    track_id: int | None = Field(None, ge=1)


class TelemetryValue(StrictModel):
    value: float
    unit: str = Field(max_length=20)
    timestamp: float = Field(ge=0)
    source: Literal["telemetry", "simulation", "vision"]


class TelemetryInput(StrictModel):
    track_id: int = Field(ge=1)
    metrics: dict[str, TelemetryValue]

    @field_validator("metrics")
    @classmethod
    def validate_metrics(cls, metrics):
        expected = {
            "altitude": "m",
            "speed": "m/s",
            "heading": "deg",
            "battery": "%",
            "signal": "%",
            "latitude": "deg",
            "longitude": "deg",
        }
        for key, metric in metrics.items():
            if (
                key not in expected
                or metric.unit != expected[key]
                or metric.source != "telemetry"
            ):
                raise ValueError(
                    "Custom metrics must use supported units and source=telemetry"
                )
            if key in ("battery", "signal") and not 0 <= metric.value <= 100:
                raise ValueError("Percentage outside 0..100")
            if key == "latitude" and not -90 <= metric.value <= 90:
                raise ValueError("Invalid latitude")
            if key == "longitude" and not -180 <= metric.value <= 180:
                raise ValueError("Invalid longitude")
            if key == "heading" and not 0 <= metric.value < 360:
                raise ValueError("Invalid heading")
            if key == "speed" and metric.value < 0:
                raise ValueError("Invalid speed")
        return metrics


class Point(StrictModel):
    x: float
    y: float
    timestamp: float


class Velocity(StrictModel):
    x: float = 0
    y: float = 0
    speed: float = 0
    unit: str = "px/s"
    source: Literal["vision", "simulation"] = "vision"


class Track(StrictModel):
    id: int
    class_name: str = "drone"
    confidence: float
    bbox: list[float]
    center: list[float]
    timestamp: float
    velocity: Velocity
    direction: float
    angular_velocity: float = 0
    history: list[Point] = []
    status: Literal["tracking", "lost"] = "tracking"
    duration: float = 0
    path_length: float = 0
    avg_speed: float = 0
    max_speed: float = 0
    source: Literal["vision", "simulation"] = "vision"
    predicted_center: list[float] | None = None
    mask: list[list[float]] | None = None


class Packet(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    seq: int = 0
    timestamp: float = 0
    video_time: float = 0
    fps: float = 0
    latency_ms: float = 0
    processing_ms: float = 0
    frame_index: int = 0
    width: int = 960
    height: int = 540
    duration: float | None = None
    source: str = "none"
    source_label: str = "No source"
    data_source: str = "vision"
    status: str = "idle"
    tracking: bool = False
    recording: bool = False
    playback_speed: float = 1
    model: str = "No model loaded"
    device: str = "CPU"
    session_id: str | None = None
    selected_track: int | None = None
    objects: list[Track] = []
    telemetry: dict[str, dict[str, TelemetryValue]] = {}
    statistics: dict[str, Any] = {}
    frame: str | None = None
    error: str | None = None


class Health(BaseModel):
    status: str
    version: str
    device: str
    model_ready: bool
    authentication: bool
    engine_status: str


class Result(BaseModel):
    ok: bool = True
    message: str = ""


class Asset(BaseModel):
    asset_id: str
    name: str
    width: int
    height: int
    fps: float
    duration: float | None
    codec: str


class ModelInfo(BaseModel):
    loaded: str | None
    device: str
    files: list[str]
    classes: list[str]
    segmentation: bool
    pt_upload_enabled: bool
    deepsort_available: bool


class SessionInfo(BaseModel):
    id: str
    name: str
    started_at: float
    ended_at: float | None
    source: str
    model: str
    algorithm: str
    saved: bool
    frame_count: int
    metadata: dict[str, Any]
    statistics: dict[str, Any]


class SessionDetail(BaseModel):
    session: SessionInfo
    frames: list[dict[str, Any]]
    next_offset: int | None


class LogEntry(BaseModel):
    id: int
    timestamp: float
    level: str
    category: str
    message: str
