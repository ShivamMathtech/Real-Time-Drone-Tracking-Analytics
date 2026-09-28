from dataclasses import dataclass
from pathlib import Path
import importlib.util
import numpy as np
from app.config import config

ALLOWED_CLASSES = {
    "drone",
    "uav",
    "quadcopter",
    "unmanned aerial vehicle",
    "unmanned aircraft",
    "drones",
}


@dataclass
class Detection:
    bbox: list[float]
    confidence: float
    class_id: int = 0
    class_name: str = "drone"
    mask: list[list[float]] | None = None


def parse_result(result, allowed_ids: set[int]) -> list[Detection]:
    output = []
    if result.boxes is None:
        return output
    xyxy = result.boxes.xyxy.cpu().numpy()
    scores = result.boxes.conf.cpu().numpy()
    classes = result.boxes.cls.cpu().numpy()
    for i, (box, score, cls) in enumerate(zip(xyxy, scores, classes)):
        if (
            int(cls) not in allowed_ids
            or not np.isfinite(box).all()
            or not np.isfinite(score)
        ):
            continue
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        mask = None
        if result.masks is not None and i < len(result.masks.xy):
            polygon = result.masks.xy[i]
            mask = polygon[:: max(1, len(polygon) // 160)].astype(float).tolist()
        output.append(
            Detection(box.astype(float).tolist(), float(score), int(cls), "drone", mask)
        )
    return output


class ModelManager:
    def __init__(self, log):
        self.model = None
        self.filename = None
        self.device = "cpu"
        self.allowed_ids = set()
        self.log = log
        self.segmentation = False
        self.names = []

    def load(self, filename, device="auto"):
        if Path(filename).name != filename or Path(filename).suffix.lower() not in (
            ".pt",
            ".onnx",
        ):
            raise ValueError(
                "Choose a .pt or .onnx model from the configured model directory"
            )
        path = config.model_dir / filename
        if not path.is_file():
            raise ValueError(
                "Model missing. Install drone-trained weights in backend/models."
            )
        from ultralytics import YOLO
        import torch

        selected = "cuda:0" if device != "cpu" and torch.cuda.is_available() else "cpu"
        if path.suffix.lower() == ".onnx" and selected != "cpu":
            import onnxruntime

            if "CUDAExecutionProvider" not in onnxruntime.get_available_providers():
                selected = "cpu"
                self.log.add(
                    "ONNX Runtime has no CUDA provider; using CPU", "WARNING", "model"
                )
        if device == "cuda" and selected == "cpu":
            self.log.add("CUDA unavailable; using CPU", "WARNING", "model")
        # PT is executable pickle content: only operator-trusted local weights are accepted.
        task = None
        if path.suffix == ".onnx":
            import onnx

            graph = onnx.load(str(path), load_external_data=False)
            if any(
                t.data_location == onnx.TensorProto.EXTERNAL
                for t in graph.graph.initializer
            ):
                raise ValueError("Use a self-contained ONNX model")
            metadata = {p.key: p.value for p in graph.metadata_props}
            task = metadata.get("task", "detect")
            if task not in ("detect", "segment"):
                raise ValueError("Only detection and segmentation models are supported")
        candidate = YOLO(str(path), task=task)
        try:
            candidate.predict(
                np.zeros((320, 320, 3), dtype=np.uint8),
                device=selected,
                verbose=False,
                imgsz=320,
            )
        except RuntimeError:
            if selected == "cpu":
                raise
            selected = "cpu"
            self.log.add(
                "GPU initialization failed; retrying model on CPU", "WARNING", "model"
            )
            candidate.predict(
                np.zeros((320, 320, 3), dtype=np.uint8),
                device="cpu",
                verbose=False,
                imgsz=320,
            )
        names = candidate.names
        allowed = {
            int(k)
            for k, v in names.items()
            if str(v).strip().lower() in ALLOWED_CLASSES
        }
        if not allowed:
            raise ValueError(
                "Model has no drone/UAV class. Generic COCO weights are not a drone detector."
            )
        self.model = candidate
        self.filename = filename
        self.allowed_ids = allowed
        self.device = selected
        self.names = [str(names[i]) for i in sorted(allowed)]
        self.segmentation = candidate.task == "segment"
        self.log.add(f"Model loaded: {filename}; device={selected}", "INFO", "model")

    def detect(self, frame, settings):
        if self.model is None:
            raise ValueError(
                "No drone model loaded. Install and select drone-trained weights in Settings."
            )
        try:
            result = self.model.predict(
                frame,
                conf=max(0.05, settings.confidence * 0.3),
                iou=settings.iou,
                device=self.device,
                classes=sorted(self.allowed_ids),
                verbose=False,
                imgsz=640,
                max_det=settings.max_objects * 2,
            )[0]
        except RuntimeError:
            if self.device == "cpu":
                raise
            self.device = "cpu"
            self.log.add("GPU inference failed; retrying on CPU", "WARNING", "model")
            result = self.model.predict(
                frame,
                conf=max(0.05, settings.confidence * 0.3),
                iou=settings.iou,
                device="cpu",
                classes=sorted(self.allowed_ids),
                verbose=False,
                imgsz=640,
                max_det=settings.max_objects * 2,
            )[0]
        return parse_result(result, self.allowed_ids)

    def info(self):
        return dict(
            loaded=self.filename,
            device=self.device.upper(),
            files=sorted(
                p.name
                for p in config.model_dir.iterdir()
                if p.suffix.lower() in (".pt", ".onnx") and p.is_file()
            ),
            classes=self.names,
            segmentation=self.segmentation,
            pt_upload_enabled=config.allow_pt_upload,
            deepsort_available=importlib.util.find_spec("deep_sort_realtime")
            is not None,
        )
