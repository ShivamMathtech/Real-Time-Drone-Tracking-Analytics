import math
from collections import deque
from app.tracking.kalman import PositionKalman


class TrackManager:
    def __init__(self, settings, log, start_id=1):
        self.settings = settings
        self.log = log
        self.states = {}
        self.id_map = {}
        self.next_id = start_id

    def clear_history(self):
        for s in self.states.values():
            s["history"].clear()

    def update(self, observations, timestamp, source="vision"):
        seen = set()
        for algorithm_id, det in observations:
            if algorithm_id not in self.id_map:
                self.id_map[algorithm_id] = self.next_id
                self.next_id += 1
            tid = self.id_map[algorithm_id]
            seen.add(tid)
            x = (det.bbox[0] + det.bbox[2]) / 2
            y = (det.bbox[1] + det.bbox[3]) / 2
            s = self.states.get(tid)
            if s is None:
                s = dict(
                    first=timestamp,
                    last=timestamp,
                    filter_time=timestamp,
                    raw=[x, y],
                    center=[x, y],
                    vx=0.0,
                    vy=0.0,
                    speed=0.0,
                    direction=0.0,
                    angular_velocity=0.0,
                    path_length=0.0,
                    max_speed=0.0,
                    samples=0,
                    speed_sum=0.0,
                    history=deque(maxlen=max(1, self.settings.trail_length)),
                    filter=PositionKalman(x, y),
                    status="tracking",
                )
                self.states[tid] = s
                self.log.add(f"Drone #{tid} detected", category="tracking")
            else:
                if s["status"] == "lost":
                    self.log.add(f"Track #{tid} recovered", category="tracking")
                dt = timestamp - s["last"]
                if dt > 1e-6:
                    dx = x - s["raw"][0]
                    dy = y - s["raw"][1]
                    s["path_length"] += math.hypot(dx, dy)
                    if self.settings.kalman:
                        s["filter"].predict(timestamp - s["filter_time"])
                        state = s["filter"].update(x, y)
                        s["center"] = state[:2].tolist()
                        s["vx"] = float(state[2])
                        s["vy"] = float(state[3])
                    else:
                        alpha = 1 - math.exp(-dt / 0.15)
                        s["vx"] = alpha * dx / dt + (1 - alpha) * s["vx"]
                        s["vy"] = alpha * dy / dt + (1 - alpha) * s["vy"]
                        s["center"] = [x, y]
                    s["speed"] = math.hypot(s["vx"], s["vy"])
                    old = s["direction"]
                    if s["speed"] > 0.1:
                        s["direction"] = (
                            math.degrees(math.atan2(s["vy"], s["vx"])) % 360
                        )
                    s["angular_velocity"] = (
                        (s["direction"] - old + 180) % 360 - 180
                    ) / dt
                    s["samples"] += 1
                    s["speed_sum"] += s["speed"]
                    s["max_speed"] = max(s["max_speed"], s["speed"])
            s.update(
                last=timestamp,
                filter_time=timestamp,
                raw=[x, y],
                bbox=det.bbox,
                confidence=det.confidence,
                status="tracking",
                mask=det.mask,
                source=source,
            )
            s["history"].append(
                dict(x=s["center"][0], y=s["center"][1], timestamp=timestamp)
            )
        for tid, s in list(self.states.items()):
            if tid in seen:
                continue
            if timestamp - s["last"] > self.settings.lost_timeout:
                self.log.add(f"Track #{tid} expired", category="tracking")
                del self.states[tid]
                continue
            if s["status"] != "lost":
                self.log.add(
                    f"Temporary detection loss: drone #{tid}", "WARNING", "tracking"
                )
            s["status"] = "lost"
            if self.settings.kalman and timestamp > s["filter_time"]:
                s["filter"].predict(timestamp - s["filter_time"])
                s["filter_time"] = timestamp
        self.id_map = {
            key: tid for key, tid in self.id_map.items() if tid in self.states
        }
        return self.snapshot(timestamp)

    def snapshot(self, timestamp):
        result = []
        for tid, s in self.states.items():
            result.append(
                dict(
                    id=tid,
                    class_name="drone",
                    confidence=s["confidence"],
                    bbox=s["bbox"],
                    center=s["center"],
                    timestamp=s["last"],
                    velocity=dict(
                        x=s["vx"],
                        y=s["vy"],
                        speed=s["speed"],
                        unit="px/s",
                        source=s["source"],
                    ),
                    direction=s["direction"],
                    angular_velocity=s["angular_velocity"],
                    history=list(s["history"]) if self.settings.trail_length else [],
                    status=s["status"],
                    duration=max(0, timestamp - s["first"]),
                    path_length=s["path_length"],
                    avg_speed=s["speed_sum"] / max(1, s["samples"]),
                    max_speed=s["max_speed"],
                    source=s["source"],
                    predicted_center=s["filter"].state[:2].tolist()
                    if s["status"] == "lost" and self.settings.kalman
                    else None,
                    mask=s.get("mask"),
                )
            )
        return result
