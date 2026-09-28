import math, time
from threading import Lock
from abc import ABC, abstractmethod
from app.config import config
from app.models.schemas import TelemetryInput


class TelemetryProvider(ABC):
    @abstractmethod
    def read(self, track_ids: list[int], timestamp: float) -> dict: ...


class NoTelemetryProvider(TelemetryProvider):
    def read(self, track_ids, timestamp):
        return {}


class SimulationTelemetryProvider(TelemetryProvider):
    def read(self, track_ids, timestamp):
        return {
            str(i): {
                key: dict(
                    value=value, unit=unit, timestamp=time.time(), source="simulation"
                )
                for key, value, unit in [
                    ("altitude", 60 + 8 * math.sin(timestamp * 0.12 + i), "m"),
                    ("speed", 8 + 2 * math.sin(timestamp * 0.3 + i), "m/s"),
                    ("heading", (timestamp * 8 + i * 55) % 360, "deg"),
                    ("battery", max(0, 100 - timestamp * 0.015), "%"),
                    ("signal", 90 + 5 * math.sin(timestamp * 0.1), "%"),
                ]
            }
            for i in track_ids
        }


class CustomTelemetryProvider(TelemetryProvider):
    def __init__(self):
        self.values = {}
        self.lock = Lock()

    def ingest(self, payload: TelemetryInput):
        now = time.time()
        if any(
            abs(m.timestamp - now) > config.telemetry_ttl_seconds
            for m in payload.metrics.values()
        ):
            raise ValueError("Telemetry timestamp must be recent Unix seconds")
        with self.lock:
            self.values[str(payload.track_id)] = {
                k: v.model_dump() for k, v in payload.metrics.items()
            }

    def read(self, track_ids, timestamp):
        now = time.time()
        with self.lock:
            self.values = {
                i: {
                    k: v
                    for k, v in metrics.items()
                    if 0 <= now - v["timestamp"] <= config.telemetry_ttl_seconds
                }
                for i, metrics in self.values.items()
            }
            self.values = {i: metrics for i, metrics in self.values.items() if metrics}
            return {
                str(i): dict(self.values.get(str(i), {}))
                for i in track_ids
                if self.values.get(str(i))
            }
