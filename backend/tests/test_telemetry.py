import time
import pytest
from pydantic import ValidationError
from app.models.schemas import TelemetryInput
from app.telemetry.providers import (
    CustomTelemetryProvider,
    NoTelemetryProvider,
    SimulationTelemetryProvider,
)


def payload(**changes):
    return TelemetryInput(
        track_id=1,
        metrics={
            "altitude": {
                "value": 63.2,
                "unit": "m",
                "timestamp": time.time(),
                "source": "telemetry",
                **changes,
            }
        },
    )


def test_telemetry_units_and_provenance():
    p = CustomTelemetryProvider()
    p.ingest(payload())
    assert p.read([1], 0)["1"]["altitude"]["source"] == "telemetry"
    assert p.read([2], 0) == {}
    with pytest.raises(ValidationError):
        payload(unit="px")
    with pytest.raises(ValidationError):
        payload(value=float("nan"))
    with pytest.raises(ValidationError):
        payload(source="simulation")
    with pytest.raises(ValueError):
        p.ingest(payload(timestamp=time.time() - 100))


def test_expired_telemetry_removed():
    p = CustomTelemetryProvider()
    p.ingest(payload())
    p.values["1"]["altitude"]["timestamp"] -= 100
    assert p.read([1], 0) == {}


def test_simulation_and_missing_values():
    assert NoTelemetryProvider().read([1], 0) == {}
    simulation = SimulationTelemetryProvider().read([1, 2], 1)
    assert all(
        v["source"] == "simulation"
        for values in simulation.values()
        for v in values.values()
    )
