from types import SimpleNamespace
import numpy as np
from app.vision.detector import Detection


class TrackerAdapter:
    def __init__(self, settings):
        self.settings = settings
        self.algorithm = settings.algorithm
        if self.algorithm == "bytetrack":
            from ultralytics.trackers.byte_tracker import BYTETracker

            buffer_frames = max(
                1,
                int(
                    settings.lost_timeout
                    * settings.fps_limit
                    / (settings.frame_skip + 1)
                ),
            )
            args = SimpleNamespace(
                track_high_thresh=settings.confidence,
                track_low_thresh=max(0.05, settings.confidence * 0.3),
                new_track_thresh=settings.confidence,
                track_buffer=buffer_frames,
                match_thresh=0.8,
                fuse_score=True,
            )
            self.tracker = BYTETracker(args)
        else:
            from deep_sort_realtime.deepsort_tracker import DeepSort

            # Appearance uses deterministic HSV crop histograms; no people re-ID model.
            self.tracker = DeepSort(
                max_age=max(1, int(settings.lost_timeout * settings.fps_limit)),
                n_init=2,
                embedder=None,
                max_cosine_distance=0.4,
            )

    def update(self, detections: list[Detection], frame):
        if self.algorithm == "bytetrack":
            from ultralytics.engine.results import Boxes

            data = np.array(
                [d.bbox + [d.confidence, d.class_id] for d in detections],
                dtype=np.float32,
            ).reshape(-1, 6)
            rows = self.tracker.update(Boxes(data, frame.shape[:2]), frame)
            output = []
            for row in rows:
                idx = int(row[7])
                d = detections[idx] if 0 <= idx < len(detections) else None
                output.append(
                    (
                        int(row[4]),
                        Detection(
                            [float(v) for v in row[:4]],
                            float(row[5]),
                            int(row[6]),
                            "drone",
                            d.mask if d else None,
                        ),
                    )
                )
            return output
        import cv2

        raw = []
        features = []
        for d in detections:
            if d.confidence < self.settings.confidence:
                continue
            x1, y1, x2, y2 = d.bbox
            raw.append(([x1, y1, x2 - x1, y2 - y1], d.confidence, "drone"))
            crop = frame[
                max(0, int(y1)) : max(1, int(y2)), max(0, int(x1)) : max(1, int(x2))
            ]
            if crop.size:
                hist = cv2.calcHist(
                    [cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)],
                    [0, 1],
                    None,
                    [16, 8],
                    [0, 180, 0, 256],
                ).flatten()
            else:
                hist = np.ones(128, dtype=np.float32)
            features.append((hist / (np.linalg.norm(hist) + 1e-8)).astype(np.float32))
        tracks = self.tracker.update_tracks(raw, embeds=features)
        return [
            (
                int(t.track_id),
                Detection(
                    t.to_ltrb().astype(float).tolist(), float(t.get_det_conf() or 0)
                ),
            )
            for t in tracks
            if t.is_confirmed() and t.time_since_update == 0
        ]
