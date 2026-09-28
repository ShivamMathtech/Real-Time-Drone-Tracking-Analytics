from abc import ABC, abstractmethod
from pathlib import Path
from urllib.parse import urlparse
import math, time, queue, ipaddress, cv2, numpy as np
from app.config import config
from app.vision.detector import Detection


class VideoSource(ABC):
    kind = "none"
    label = "No source"
    duration = None
    fps = 30.0
    width = 960
    height = 540

    @abstractmethod
    def read(self): ...
    def close(self):
        pass

    def seek(self, seconds):
        raise ValueError("Seeking is available for uploaded files only")


class DemoSource(VideoSource):
    kind = "demo"
    label = "Deterministic UAV simulation"
    fps = 30.0
    duration = None

    def __init__(self):
        self.index = 0

    def read(self):
        t = self.index / self.fps
        self.index += 1
        y, x = np.mgrid[: self.height, : self.width]
        frame = np.zeros((self.height, self.width, 3), np.uint8)
        frame[:, :, 0] = (28 + y * 0.035).astype(np.uint8)
        frame[:, :, 1] = (20 + y * 0.025).astype(np.uint8)
        frame[:, :, 2] = 10
        for xx in range(0, 960, 60):
            cv2.line(frame, (xx, 0), (xx, 540), (48, 41, 24), 1)
        for yy in range(0, 540, 60):
            cv2.line(frame, (0, yy), (960, yy), (48, 41, 24), 1)
        horizontal = 24 - abs((t % 48) - 24)
        diagonal = 26 - abs((t % 52) - 26)
        paths = [
            (150 + 25 * horizontal, 165),
            (170 + 18 * diagonal, 240 + 5 * diagonal),
            (610 + 100 * math.cos(t * 0.35), 310 + 90 * math.sin(t * 0.35)),
        ]
        detections = []
        for i, (cx, cy) in enumerate(paths):
            cx = int(cx)
            cy = int(cy)
            col = [(215, 190, 64), (160, 230, 60), (220, 140, 230)][i]
            cv2.line(frame, (cx - 20, cy - 12), (cx + 20, cy + 12), col, 3)
            cv2.line(frame, (cx + 20, cy - 12), (cx - 20, cy + 12), col, 3)
            for dx in [-24, 24]:
                for dy in [-15, 15]:
                    cv2.ellipse(frame, (cx + dx, cy + dy), (12, 5), 0, 0, 360, col, 2)
            cv2.ellipse(frame, (cx, cy), (9, 6), 0, 0, 360, col, -1)
            detections.append(
                Detection(
                    [cx - 39, cy - 25, cx + 39, cy + 25],
                    0.91 + 0.055 * math.sin(t * 0.5 + i),
                    0,
                    "drone",
                    [
                        [cx - 35, cy - 20],
                        [cx - 16, cy - 20],
                        [cx, cy - 6],
                        [cx + 16, cy - 20],
                        [cx + 35, cy - 20],
                        [cx + 35, cy + 20],
                        [cx + 15, cy + 20],
                        [cx, cy + 6],
                        [cx - 15, cy + 20],
                        [cx - 35, cy + 20],
                    ],
                )
            )
        cv2.putText(
            frame,
            "MATH TECH / SYNTHETIC FLIGHT FIELD",
            (24, 38),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (170, 150, 95),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            "DEMO MODE - simulated detections, trajectories and confidence",
            (24, 514),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (200, 180, 105),
            1,
            cv2.LINE_AA,
        )
        return frame, t, detections


class FileSource(VideoSource):
    kind = "file"

    def __init__(self, path: Path):
        self.capture = cv2.VideoCapture(str(path))
        self.label = "Uploaded video"
        if not self.capture.isOpened():
            self.close()
            raise ValueError(
                "Video cannot be opened. Use an MP4/WebM/AVI codec supported by OpenCV."
            )
        self.fps = float(self.capture.get(cv2.CAP_PROP_FPS)) or 30
        if not math.isfinite(self.fps) or self.fps <= 0:
            self.fps = 30
        self.width = int(self.capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.count = int(self.capture.get(cv2.CAP_PROP_FRAME_COUNT))
        self.duration = self.count / self.fps if self.count > 0 else None
        if not 0 < self.width * self.height <= 3840 * 2160:
            self.close()
            raise ValueError("Video dimensions must be within 3840×2160")
        self.index = 0

    def read(self):
        success, frame = self.capture.read()
        if not success:
            return None
        timestamp = self.index / self.fps
        self.index += 1
        return frame, timestamp, None

    def seek(self, seconds):
        if self.duration is None:
            raise ValueError("This video has no seekable duration")
        self.index = min(self.count - 1, max(0, int(seconds * self.fps)))
        if not self.capture.set(cv2.CAP_PROP_POS_FRAMES, self.index):
            raise ValueError("Codec does not support seeking")

    def metadata(self):
        fourcc = int(self.capture.get(cv2.CAP_PROP_FOURCC))
        return dict(
            width=self.width,
            height=self.height,
            fps=self.fps,
            duration=self.duration,
            codec="".join(chr((fourcc >> (8 * i)) & 255) for i in range(4)).strip(
                "\x00"
            ),
        )

    def close(self):
        if hasattr(self, "capture"):
            self.capture.release()


class RTSPSource(VideoSource):
    kind = "rtsp"
    label = "Network camera"

    def __init__(self, url):
        parsed = urlparse(url or "")
        allowed = {
            h.strip().lower() for h in config.rtsp_allowed_hosts.split(",") if h.strip()
        }
        if not config.enable_rtsp:
            raise ValueError("RTSP is disabled. Enable the backend adapter in .env.")
        if (
            parsed.scheme not in ("rtsp", "rtsps")
            or not parsed.hostname
            or parsed.hostname.lower() not in allowed
        ):
            raise ValueError("RTSP host must match RTSP_ALLOWED_HOSTS")
        self.capture = cv2.VideoCapture(
            url,
            cv2.CAP_FFMPEG,
            [
                cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
                5000,
                cv2.CAP_PROP_READ_TIMEOUT_MSEC,
                3000,
            ],
        )
        if not self.capture.isOpened():
            self.close()
            raise ValueError("Network stream unavailable or unsupported codec")
        self.start = time.monotonic()

    def read(self):
        ok, frame = self.capture.read()
        if not ok:
            return None
        return frame, time.monotonic() - self.start, None

    def close(self):
        if hasattr(self, "capture"):
            self.capture.release()


class BackendCameraSource(VideoSource):
    kind = "backend_camera"
    label = "Backend USB camera"

    def __init__(self, index):
        self.capture = cv2.VideoCapture(index)
        if not self.capture.isOpened():
            self.close()
            raise ValueError("Backend camera unavailable")
        self.start = time.monotonic()

    def read(self):
        ok, frame = self.capture.read()
        return (frame, time.monotonic() - self.start, None) if ok else None

    def close(self):
        if hasattr(self, "capture"):
            self.capture.release()


class WebcamSource(VideoSource):
    kind = "webcam"
    label = "Browser camera"

    def __init__(self):
        self.queue = queue.Queue(maxsize=1)
        self.first = None
        self.last = -1

    def put(self, frame, timestamp):
        if not math.isfinite(timestamp) or timestamp <= self.last:
            raise ValueError("Camera timestamps must increase monotonically")
        self.last = timestamp
        if self.first is None:
            self.first = timestamp
        if self.queue.full():
            try:
                self.queue.get_nowait()
            except queue.Empty:
                pass
        self.queue.put_nowait((frame, timestamp - self.first, None))

    def read(self):
        try:
            return self.queue.get_nowait()
        except queue.Empty:
            return "waiting"


def resolve_asset(asset_id):
    import re

    if not re.fullmatch(r"[a-f0-9]{32}", asset_id or ""):
        raise ValueError("Invalid video asset ID")
    matches = list((config.data_dir / "videos").glob(asset_id + ".*"))
    if not matches:
        raise ValueError("Uploaded video not found")
    return matches[0]


def make_source(req):
    if req.kind == "demo":
        return DemoSource()
    if req.kind == "webcam":
        return WebcamSource()
    if req.kind == "file":
        return FileSource(resolve_asset(req.asset_id))
    if req.kind == "rtsp":
        return RTSPSource(req.url)
    return BackendCameraSource(req.camera_index)
