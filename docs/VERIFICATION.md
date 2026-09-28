# Release verification — v1.0.0

Verified on 28 September 2026 in a Linux x86-64 environment with Python 3.12,
Node.js 24, CPU PyTorch, and Chromium. Source dependencies are pinned in the
backend requirements and frontend lockfile.

## Executed checks

| Check | Result |
|---|---|
| TypeScript compilation + Vite production build | Passed; built frontend included |
| Python compilation and critical Ruff checks | Passed |
| Backend tests | **21 passed** |
| React/Vitest component tests | **6 passed** |
| Playwright browser acceptance tests | **3 passed** |
| CPU YOLO/ONNX Runtime on a synthetic pixel detector | Passed |
| CPU fallback after a simulated CUDA RuntimeError | Passed |
| CPU selection for ONNX when its CUDA provider is absent | Passed; targeted detector tests rerun |
| OpenAPI document and SQLite/PostgreSQL DDL generation | Passed |
| Compose files parsed as YAML; service/dependency configuration inspected | Passed static inspection |

One upstream Starlette test-client deprecation notice was emitted for its use of
httpx. It did not affect execution. No failing build, backend test, component test,
or browser test remains in this release.

## Browser acceptance coverage

1. Start a real backend and Vite frontend against an isolated temporary database.
   Launch the deterministic demo; receive three tracks over the WebSocket; select
   a track; enable JPEG recording; switch visual modes; download a PNG, CSV and
   JSON; save a session; inspect analytics and logs; pause; load and play recorded
   session data; exit replay. Browser page-error checks remain empty.
2. Apply settings through the UI; verify backend values; check viewport overflow
   at 1280×720, 768×1024 and 390×844; forcibly close an **active** observer WebSocket
   and verify that a new connection opens; stream a browser-provided synthetic
   webcam; stop it. Desktop/mobile screenshots were visually inspected.
3. Upload a generated video through the actual browser file input; load the
   test-only ONNX model in the actual backend; run Ultralytics inference and
   ByteTrack; observe a moving track in the React UI; export a non-empty CSV.

The desktop screenshot uses a 1600×1050 viewport with full-page capture. Layouts
allow vertical scrolling; they are not compressed to fit every panel into a 720px
viewport. A 1920px layout has CSS rules but was not a separate browser test case.

## Backend coverage

- Detection parser filters unsupported classes and invalid boxes.
- Actual ONNX Runtime execution computes a box from synthetic red image pixels.
- Official ByteTrack retains multiple IDs and recovers a low-confidence observation.
- Optional DeepSORT adapter runs with supplied HSV embeddings.
- EMA motion, image direction, bounded trails, missed detections, recovery and expiry.
- Variable-timestep Kalman velocity and positive covariance.
- Missing, simulated, stale, nonfinite and incorrectly labeled telemetry.
- REST validation, unsafe asset/model paths, invalid video content and blocked RTSP.
- WebSocket source frames, browser-camera binary JPEG input, frame skipping,
  reconnection, origin rejection and API-key authentication.
- Session storage, JPEG retrieval, named saves, pagination, CSV/JSON/HTML exports,
  session deletion, settings and lifecycle logs.

## Important limits of the evidence

**No real trained drone weights or real UAV footage were supplied.** Therefore this
release does not establish real-drone precision, recall, tracking accuracy, or a
real-world frame-rate benchmark. The ONNX fixture is a deterministic image-pixel
model for software integration testing only; its builder is clearly marked in the
test directory and no test weights are installed into the shipped models folder.

The following need validation in the user's environment:

- Physical webcam/USB camera permissions, codecs, latency and device behavior.
- RTSP camera connectivity, credentials, codec and receive-time characteristics.
- NVIDIA GPU and GPU-enabled ONNX Runtime, if desired.
- Actual sensor telemetry and its association with visual track IDs.
- Windows/macOS installation and execution; commands are supplied but were not run.
- Docker image build, container startup, PostgreSQL runtime and GPU overlay. No
  Docker daemon or NVIDIA GPU was available during verification. SQLAlchemy DDL
  was generated for PostgreSQL; database runtime tests used SQLite.
- Production authentication architecture, network exposure, backup/restore,
  long-duration load and multi-stream deployments. The delivered runtime is one
  shared operator workspace, with one ordered worker per process.

The package is an end-to-end working software implementation with explicit demo
and measurement provenance. The checks above should not be interpreted as hardware
qualification, detector training, a field trial, or a production performance SLA.
