"""Launch isolated backend/frontend subprocesses and execute the browser suite.
Run with the backend virtualenv: python scripts/run_e2e.py
Requires frontend/node_modules and `npx playwright install chromium`.
"""

import os, sys, time, tempfile, subprocess, urllib.request, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def wait_for(url, process):
    for _ in range(150):
        if process.poll() is not None:
            raise RuntimeError(f"Server exited with {process.returncode}")
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("Server readiness timeout")


def main():
    folder = Path(tempfile.mkdtemp(prefix="mathtech-e2e-"))
    env = os.environ.copy()
    env.update(
        DATA_DIR=str(folder / "data"),
        MODEL_DIR=str(folder / "models"),
        DATABASE_URL="sqlite:///" + str(folder / "test.db"),
        MODEL_PATH="",
        API_KEY="",
        E2E_BASE_URL="http://127.0.0.1:5173",
        E2E_API_URL="http://127.0.0.1:8000",
        YOLO_AUTOINSTALL="false",
    )
    sys.path.insert(0, str(ROOT / "backend"))
    from tests.model_fixture import build_synthetic_onnx
    import cv2, numpy as np

    (folder / "models").mkdir(parents=True, exist_ok=True)
    build_synthetic_onnx(folder / "models" / "synthetic_e2e_fixture.onnx")
    video = folder / "synthetic-red-uav.avi"
    writer = cv2.VideoWriter(
        str(video), cv2.VideoWriter_fourcc(*"MJPG"), 20, (640, 640)
    )
    for i in range(100):
        frame = np.zeros((640, 640, 3), np.uint8)
        x = 60 + 3 * i
        frame[275:325, x : x + 70] = (0, 0, 255)
        writer.write(frame)
    writer.release()
    env["E2E_VIDEO_FILE"] = str(video)
    npm = "npm.cmd" if os.name == "nt" else "npm"
    processes = []
    try:
        with (folder / "backend.log").open("w") as log:
            backend = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8000",
                ],
                cwd=ROOT / "backend",
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            processes.append(backend)
            wait_for("http://127.0.0.1:8000/api/health", backend)
            with (folder / "frontend.log").open("w") as frontlog:
                frontend = subprocess.Popen(
                    [npm, "run", "dev", "--", "--strictPort"],
                    cwd=ROOT / "frontend",
                    env=env,
                    stdout=frontlog,
                    stderr=subprocess.STDOUT,
                )
                processes.append(frontend)
                wait_for("http://127.0.0.1:5173", frontend)
                result = subprocess.run(
                    [npm, "run", "test:e2e"], cwd=ROOT / "frontend", env=env
                )
                if result.returncode:
                    print("Backend log:", (folder / "backend.log").read_text()[-10000:])
                    print(
                        "Frontend log:", (folder / "frontend.log").read_text()[-3000:]
                    )
                return result.returncode
    finally:
        for p in reversed(processes):
            p.terminate()
        for p in processes:
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    raise SystemExit(main())
