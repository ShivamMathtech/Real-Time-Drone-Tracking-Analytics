"""Generate an explicitly synthetic MP4 and ground-truth coordinates, without model weights."""

import json, sys, argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.vision.sources import DemoSource
import cv2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=float, default=8)
    args = parser.parse_args()
    folder = ROOT / "data" / "videos"
    folder.mkdir(parents=True, exist_ok=True)
    source = DemoSource()
    path = folder / "synthetic-drone-trajectories.mp4"
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        source.fps,
        (source.width, source.height),
    )
    if not writer.isOpened():
        raise RuntimeError(
            "MP4 encoder unavailable; install an OpenCV build with FFmpeg"
        )
    records = []
    for i in range(int(source.fps * args.seconds)):
        frame, t, detections = source.read()
        writer.write(frame)
        records.append(
            {
                "timestamp": t,
                "source": "simulation",
                "objects": [
                    {"id": j + 1, "bbox": d.bbox, "confidence": d.confidence}
                    for j, d in enumerate(detections)
                ],
            }
        )
    writer.release()
    (folder / "synthetic-ground-truth.json").write_text(
        json.dumps(
            {"notice": "SIMULATED DATA; not real drone detections", "frames": records},
            indent=2,
        )
    )
    print(path)


if __name__ == "__main__":
    main()
