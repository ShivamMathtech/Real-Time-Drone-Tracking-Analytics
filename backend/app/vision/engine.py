import base64, time, threading, copy, cv2, math
from app.config import config
from app.models.schemas import Settings, Packet
from app.utils.logging import EventLog
from app.vision.detector import ModelManager
from app.vision.sources import make_source, WebcamSource
from app.tracking.algorithms import TrackerAdapter
from app.tracking.manager import TrackManager
from app.analytics.engine import AnalyticsEngine
from app.telemetry.providers import (
    NoTelemetryProvider,
    SimulationTelemetryProvider,
    CustomTelemetryProvider,
)
from app.sessions.repository import SessionRepository


class VisionEngine:
    def __init__(self):
        self.lock = threading.RLock()
        self.log = EventLog()
        self.repo = SessionRepository()
        saved = self.repo.settings()
        self.settings = (
            Settings(**saved)
            if saved
            else Settings(
                confidence=config.confidence_threshold,
                iou=config.iou_threshold,
                device=config.device,
            )
        )
        self.models = ModelManager(self.log)
        self.source = None
        self.status = "idle"
        self.tracking = False
        self.recording = False
        self.manager = TrackManager(self.settings, self.log)
        self.tracker = None
        self.analytics = AnalyticsEngine()
        self.custom_telemetry = CustomTelemetryProvider()
        self.simulation_telemetry = SimulationTelemetryProvider()
        self.empty_telemetry = NoTelemetryProvider()
        self.session_id = None
        self.frame_index = 0
        self.seq = 0
        self.speed = 1.0
        self.selected_track = None
        self.packet = Packet().model_dump()
        self.shutdown_event = threading.Event()
        self.last_frame_clock = None
        self.camera_frame_count = 0
        self.next_frame = 0.0
        self.consecutive_errors = 0
        self.last_telemetry_clock = 0.0
        self.cached_telemetry = {}
        if config.model_path:
            try:
                self.models.load(
                    config.model_path.split("/")[-1].split("\\")[-1],
                    self.settings.device,
                )
            except Exception:
                self.log.add(
                    "Configured model unavailable; install compatible drone weights in Settings",
                    "WARNING",
                    "model",
                )
        self.log.sink = lambda item: (
            self.repo.event(self.session_id, item) if self.session_id else None
        )
        self.thread = threading.Thread(
            target=self.run, daemon=True, name="vision-worker"
        )
        self.thread.start()
        self.log.add("Vision service online. Select a source to begin.")

    def snapshot(self):
        with self.lock:
            return self.packet

    def status_packet(self, error=None):
        self.seq += 1
        self.packet = {
            **self.packet,
            "seq": self.seq,
            "status": self.status,
            "tracking": self.tracking,
            "recording": self.recording,
            "playback_speed": self.speed,
            "error": error,
            "selected_track": self.selected_track,
            "model": (
                "Deterministic simulation"
                if self.source and self.source.kind == "demo"
                else self.models.filename or "No model loaded"
            ),
            "device": "CPU"
            if self.source and self.source.kind == "demo"
            else self.models.device.upper(),
        }

    def stop(self):
        with self.lock:
            if self.source:
                self.source.close()
            self.source = None
            self.status = "stopped"
            self.tracking = False
            self.recording = False
            self.selected_track = None
            self.packet = {**self.packet, "objects": [], "fps": 0}
            self.repo.finish(self.session_id)
            self.status_packet()
        self.log.add("Source stopped", category="source")

    def start(self, request):
        with self.lock:
            source = make_source(request)
            try:
                tracker = TrackerAdapter(self.settings)
            except Exception:
                source.close()
                raise ValueError(
                    "Tracking dependencies unavailable. Install backend requirements."
                )
            self.stop()
            self.source = source
            self.tracker = tracker
            self.manager = TrackManager(self.settings, self.log)
            self.analytics = AnalyticsEngine()
            self.frame_index = 0
            self.selected_track = None
            self.speed = 1.0
            self.consecutive_errors = 0
            self.session_id = self.repo.create(
                source.kind,
                "Deterministic simulation"
                if source.kind == "demo"
                else self.models.filename or "No model",
                self.settings.algorithm,
                self.settings.model_dump(),
            )
            self.status = "running"
            self.tracking = self.settings.auto_tracking and (
                source.kind == "demo" or self.models.model is not None
            )
            self.recording = False
            self.next_frame = 0.0
            self.last_frame_clock = None
            self.camera_frame_count = 0
            self.custom_telemetry = CustomTelemetryProvider()
            self.cached_telemetry = {}
            self.packet = Packet(
                session_id=self.session_id,
                source=source.kind,
                source_label=source.label,
                data_source="simulation" if source.kind == "demo" else "vision",
                duration=source.duration,
            ).model_dump()
            self.status_packet()
            self.log.add(f"Source started: {source.kind}", category="source")
            if source.kind != "demo" and self.models.model is None:
                self.log.add(
                    "Video preview active. Load drone weights to enable detection.",
                    "WARNING",
                    "model",
                )
            return self.packet

    def reset(self, clear_only=False):
        with self.lock:
            if clear_only:
                self.manager.clear_history()
            else:
                self.tracker = TrackerAdapter(self.settings)
                self.manager = TrackManager(
                    self.settings, self.log, self.manager.next_id
                )
                self.selected_track = None
                self.packet = {**self.packet, "objects": []}
            self.status_packet()
            self.log.add(
                "Trail history cleared" if clear_only else "Tracker reset",
                category="tracking",
            )

    def tracking_action(self, enabled):
        with self.lock:
            if not self.source:
                raise ValueError("Select a video source first")
            if enabled and self.source.kind != "demo" and self.models.model is None:
                raise ValueError("Install and load a drone model in Settings first")
            if enabled and self.status in ("ended", "error"):
                raise ValueError("Reopen the source to start a new session")
            self.tracking = enabled
            if enabled:
                self.status = "running"
            else:
                self.packet = {**self.packet, "objects": []}
                self.reset()
            self.status_packet()

    def playback(self, request):
        with self.lock:
            if not self.source:
                raise ValueError("Select a video source first")
            if request.action == "pause":
                self.status = "paused"
            elif request.action == "play":
                if self.status == "ended":
                    raise ValueError("Reopen the source or seek to replay it")
                self.status = "running"
                self.last_frame_clock = None
                self.next_frame = 0.0
            elif request.action == "speed":
                if request.value not in (0.25, 0.5, 1, 2, 4):
                    raise ValueError("Unsupported playback speed")
                if self.source.kind not in ("file", "demo"):
                    raise ValueError("Speed control is for video files and demo only")
                self.speed = request.value
            else:
                self.source.seek(request.value)
                self.repo.finish(self.session_id)
                self.session_id = self.repo.create(
                    self.source.kind,
                    self.models.filename or "No model",
                    self.settings.algorithm,
                    self.settings.model_dump(),
                )
                self.frame_index = 0
                self.manager = TrackManager(self.settings, self.log)
                self.tracker = TrackerAdapter(self.settings)
                self.analytics = AnalyticsEngine()
                self.selected_track = None
                self.status = "running"
                self.next_frame = 0.0
                self.last_frame_clock = None
                self.packet = {
                    **self.packet,
                    "session_id": self.session_id,
                    "objects": [],
                }
                self.log.add("Seek started a new analysis segment", category="source")
            self.status_packet()

    def update_settings(self, settings):
        with self.lock:
            if (
                self.source
                and self.source.kind != "demo"
                and settings.telemetry_source == "simulation"
            ):
                raise ValueError(
                    "Simulated telemetry is allowed only with the demo source"
                )
            # Validate the chosen adapter before applying any settings.
            tracker = TrackerAdapter(settings)
            if self.models.filename and settings.device != self.settings.device:
                self.models.load(self.models.filename, settings.device)
            processing_changed = self.settings.model_dump(
                exclude={"theme", "units", "language"}
            ) != settings.model_dump(exclude={"theme", "units", "language"})
            self.settings = settings
            if processing_changed:
                self.tracker = tracker
                self.manager = TrackManager(settings, self.log)
                self.selected_track = None
                if self.source:
                    self.repo.finish(self.session_id)
                    self.session_id = self.repo.create(
                        self.source.kind,
                        "Deterministic simulation"
                        if self.source.kind == "demo"
                        else self.models.filename or "No model",
                        settings.algorithm,
                        settings.model_dump(),
                    )
                    self.frame_index = 0
                    self.analytics = AnalyticsEngine()
                    self.custom_telemetry = CustomTelemetryProvider()
                self.packet = {
                    **self.packet,
                    "session_id": self.session_id,
                    "objects": [],
                    "statistics": self.analytics.snapshot(),
                }
            self.repo.save_settings(settings.model_dump())
            self.cached_telemetry = {}
            self.status_packet()
            self.log.add(
                "Settings applied"
                + ("; new analysis segment created" if processing_changed else ""),
                category="system",
            )

    def load_model(self, filename):
        with self.lock:
            if self.source:
                raise ValueError("Stop the current source before changing the model")
            self.models.load(filename, self.settings.device)
            self.status_packet()

    def enqueue_camera(self, frame, timestamp):
        with self.lock:
            if not isinstance(self.source, WebcamSource):
                raise ValueError("Start the browser camera source first")
            self.source.put(frame, timestamp)

    def process(self, item, source_ms=0.0):
        frame, t, simulated = item
        if not math.isfinite(t):
            raise ValueError("Invalid frame timestamp")
        original_h, original_w = frame.shape[:2]
        width = min(original_w, self.settings.processing_width)
        ratio = width / original_w
        if ratio < 1:
            frame = cv2.resize(
                frame,
                (width, max(1, round(original_h * ratio))),
                interpolation=cv2.INTER_AREA,
            )
        h, w = frame.shape[:2]
        begin = time.perf_counter()
        detection_begin = begin
        if self.tracking:
            if simulated is not None:
                detections = simulated
                for d in detections:
                    d.bbox = [v * ratio for v in d.bbox]
                    if d.mask:
                        d.mask = [[x * ratio, y * ratio] for x, y in d.mask]
            else:
                detections = self.models.detect(frame, self.settings)
            inference_ms = (
                source_ms
                if simulated is not None
                else (time.perf_counter() - detection_begin) * 1000
            )
            observations = self.tracker.update(detections, frame)[
                : self.settings.max_objects
            ]
            objects = self.manager.update(
                observations, t, "simulation" if simulated is not None else "vision"
            )
            if self.settings.mode == "single":
                if self.selected_track is None and objects:
                    self.selected_track = objects[0]["id"]
                objects = [o for o in objects if o["id"] == self.selected_track]
        else:
            objects = []
            inference_ms = 0.0
        clock = time.monotonic()
        fps = 1 / (clock - self.last_frame_clock) if self.last_frame_clock else 0.0
        self.last_frame_clock = clock
        if clock - self.last_telemetry_clock >= 1 / self.settings.telemetry_refresh_hz:
            provider = (
                self.custom_telemetry
                if self.settings.telemetry_source == "custom"
                else self.simulation_telemetry
                if self.settings.telemetry_source == "simulation"
                and simulated is not None
                else self.empty_telemetry
            )
            self.cached_telemetry = provider.read([o["id"] for o in objects], t)
            self.last_telemetry_clock = clock
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
        if not ok:
            raise ValueError("Frame encoding failed")
        jpeg = encoded.tobytes()
        self.seq += 1
        packet = dict(
            seq=self.seq,
            timestamp=time.time(),
            video_time=t,
            fps=round(fps, 2),
            latency_ms=round(inference_ms, 3),
            processing_ms=round((time.perf_counter() - begin) * 1000, 3),
            frame_index=self.frame_index,
            width=w,
            height=h,
            duration=self.source.duration,
            source=self.source.kind,
            source_label=self.source.label,
            data_source="simulation" if simulated is not None else "vision",
            status=self.status,
            tracking=self.tracking,
            recording=self.recording,
            playback_speed=self.speed,
            model="Deterministic simulation"
            if simulated is not None
            else self.models.filename or "No model loaded",
            device="CPU" if simulated is not None else self.models.device.upper(),
            session_id=self.session_id,
            selected_track=self.selected_track,
            objects=objects,
            telemetry=self.cached_telemetry,
            statistics={},
            frame=base64.b64encode(jpeg).decode("ascii"),
            error=None,
        )
        packet["statistics"] = self.analytics.update(packet)
        # Validation keeps invalid numeric values out of storage and WebSocket JSON.
        packet = Packet(**packet).model_dump()
        saved_image = self.repo.append(packet, jpeg)
        if self.recording and not saved_image:
            self.recording = False
            packet["recording"] = False
            self.log.add(
                "Recording quota reached; analytics continue", "WARNING", "session"
            )
        self.packet = packet
        self.frame_index += 1
        self.consecutive_errors = 0
        if self.frame_index >= config.max_session_frames:
            self.status = "ended"
            self.repo.finish(self.session_id)
            self.status_packet("Session frame limit reached. Start a new session.")
            self.log.add("Session frame limit reached", "WARNING", "session")

    def run(self):
        while not self.shutdown_event.wait(0.004):
            try:
                with self.lock:
                    if (
                        not self.source
                        or self.status != "running"
                        or time.monotonic() < self.next_frame
                    ):
                        continue
                    start = time.monotonic()
                    read_begin = time.perf_counter()
                    item = None
                    read_count = self.settings.frame_skip + 1
                    if self.source.kind in ("file", "demo"):
                        read_count = max(
                            read_count,
                            math.ceil(
                                self.source.fps * self.speed / self.settings.fps_limit
                            ),
                        )
                    elif self.source.kind == "webcam":
                        # A browser source has a single-slot queue, so repeated reads
                        # would discard the only frame and then return "waiting".
                        read_count = 1
                    for _ in range(read_count):
                        item = self.source.read()
                        if item is None or isinstance(item, str):
                            break
                    if isinstance(item, str):
                        continue
                    if item is None:
                        self.status = "ended" if self.source.kind == "file" else "error"
                        self.tracking = False
                        self.repo.finish(self.session_id)
                        self.status_packet(
                            None
                            if self.status == "ended"
                            else "Video source disconnected. Reopen the source to reconnect."
                        )
                        self.log.add(
                            "Video ended"
                            if self.status == "ended"
                            else "Video source disconnected",
                            category="source",
                        )
                        continue
                    if self.source.kind == "webcam":
                        self.camera_frame_count += 1
                        if (self.camera_frame_count - 1) % (
                            self.settings.frame_skip + 1
                        ):
                            continue
                    self.process(item, (time.perf_counter() - read_begin) * 1000)
                    source_interval = (
                        read_count / self.source.fps / self.speed
                        if self.source.kind in ("demo", "file")
                        else 0
                    )
                    self.next_frame = start + max(
                        1 / self.settings.fps_limit, source_interval
                    )
            except Exception as exc:
                with self.lock:
                    self.log.logger.exception("Frame processing failed")
                    self.consecutive_errors += 1
                    self.log.add(
                        f"Frame processing failed ({type(exc).__name__}); retrying",
                        "ERROR",
                        "vision",
                    )
                    self.next_frame = time.monotonic() + 0.3
                    if self.consecutive_errors >= 5:
                        self.status = "error"
                        self.tracking = False
                        self.status_packet(
                            "Processing stopped after repeated errors. Check model compatibility, available memory, and logs; then reopen the source."
                        )
                    # Exceptions never leave the worker or expose file paths to clients.

    def close(self):
        self.shutdown_event.set()
        self.thread.join(timeout=8)
        self.stop()
