import math
import numpy as np
import pytest
from app.models.schemas import Settings
from app.tracking.kalman import PositionKalman
from app.tracking.manager import TrackManager
from app.tracking.algorithms import TrackerAdapter
from app.vision.detector import Detection
from app.utils.logging import EventLog


def detection(x, y=80, confidence=0.95):
    return Detection([x - 10, y - 10, x + 10, y + 10], confidence)


def test_time_based_motion_and_image_direction():
    manager = TrackManager(Settings(kalman=False), EventLog())
    for i in range(51):
        tracks = manager.update([(1, detection(20 + i, 80 + 2 * i))], i * 0.1)
    t = tracks[0]
    assert t["velocity"]["x"] == pytest.approx(10, rel=0.02)
    assert t["velocity"]["y"] == pytest.approx(20, rel=0.02)
    assert t["direction"] == pytest.approx(math.degrees(math.atan2(20, 10)))
    assert t["path_length"] == pytest.approx(50 * math.sqrt(5))
    assert t["velocity"]["unit"] == "px/s"


def test_track_loss_recovery_and_timeout():
    manager = TrackManager(Settings(lost_timeout=1), EventLog())
    first = manager.update([(12, detection(10))], 0)[0]["id"]
    lost = manager.update([], 0.2)[0]
    assert lost["status"] == "lost" and lost["predicted_center"] is not None
    assert len(lost["history"]) == 1
    assert manager.update([(12, detection(12))], 0.3)[0]["id"] == first
    assert manager.update([], 2) == []


def test_duplicate_timestamp_is_finite_and_history_bounded():
    manager = TrackManager(Settings(trail_length=3), EventLog())
    for i in range(20):
        output = manager.update([(1, detection(i))], 0)
    assert len(output[0]["history"]) == 3
    assert math.isfinite(output[0]["velocity"]["speed"])


def test_kalman_velocity_and_covariance():
    f = PositionKalman(0, 0)
    for i in range(1, 100):
        f.predict(0.1)
        f.update(i * 2, 0)
    assert f.state[2] == pytest.approx(20, rel=0.02)
    assert np.linalg.eigvalsh(f.P).min() > 0
    prediction = f.predict(0.5)
    assert prediction[0] > f.state[0] - 1e-6


def test_bytetrack_preserves_three_ids_and_low_confidence_recovery():
    tracker = TrackerAdapter(Settings(fps_limit=20))
    image = np.zeros((300, 600, 3), np.uint8)
    ids = []
    for i in range(15):
        conf = 0.3 if i == 7 else 0.95
        output = tracker.update(
            [
                detection(50 + i, 50, conf),
                detection(180 + i, 130),
                detection(360 - i, 220),
            ],
            image,
        )
        ids.append(sorted(tid for tid, d in output))
    assert len(ids[0]) == 3
    assert all(x == ids[0] for x in ids)


def test_deepsort_optional_adapter():
    pytest.importorskip("deep_sort_realtime")
    tracker = TrackerAdapter(Settings(algorithm="deepsort"))
    image = np.zeros((300, 600, 3), np.uint8)
    results = []
    for i in range(8):
        results.append(tracker.update([detection(50 + i)], image))
    assert len(results[-1]) == 1
    assert results[-1][0][0] == results[-2][0][0]
