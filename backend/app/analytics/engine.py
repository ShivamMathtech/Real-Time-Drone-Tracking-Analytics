from collections import Counter


class AnalyticsEngine:
    def __init__(self):
        self.frames = 0
        self.detections = 0
        self.ids = set()
        self.confidence = 0.0
        self.fps_sum = 0.0
        self.latency_sum = 0.0
        self.longest = 0.0
        self.first = None
        self.last = 0.0
        self.direction = Counter()

    def update(self, packet):
        self.frames += 1
        self.fps_sum += packet["fps"]
        self.latency_sum += packet["latency_ms"]
        t = packet["video_time"]
        self.first = t if self.first is None else self.first
        self.last = t
        for obj in packet["objects"]:
            self.longest = max(self.longest, obj["duration"])
            if obj["status"] != "tracking":
                continue
            self.detections += 1
            self.ids.add(obj["id"])
            self.confidence += obj["confidence"]
            self.direction[int(obj["direction"] // 45) * 45] += 1
        return self.snapshot()

    def snapshot(self):
        return dict(
            total_detections=self.detections,
            unique_tracks=len(self.ids),
            average_confidence=self.confidence / max(1, self.detections),
            average_fps=self.fps_sum / max(1, self.frames),
            average_latency=self.latency_sum / max(1, self.frames),
            longest_track=self.longest,
            total_tracking_time=max(0, self.last - (self.first or 0)),
            processed_frames=self.frames,
            direction_distribution=dict(self.direction),
        )
