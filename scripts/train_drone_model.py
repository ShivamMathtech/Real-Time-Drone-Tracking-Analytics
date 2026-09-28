"""Train only on an operator-supplied, licensed UAV dataset. No dataset is downloaded."""

import argparse
from ultralytics import YOLO


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", required=True, help="Drone dataset YAML")
    p.add_argument(
        "--base",
        default="yolo11n.yaml",
        help="Model YAML (scratch training) or trusted local pretrained checkpoint",
    )
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--imgsz", type=int, default=960)
    p.add_argument("--device", default="cpu")
    p.add_argument("--batch", type=int, default=8)
    a = p.parse_args()
    model = YOLO(a.base)
    model.train(
        data=a.data,
        epochs=a.epochs,
        imgsz=a.imgsz,
        device=a.device,
        batch=a.batch,
        project="runs/drone",
        name="detector",
    )
    model.val(data=a.data, split="test")


if __name__ == "__main__":
    main()
