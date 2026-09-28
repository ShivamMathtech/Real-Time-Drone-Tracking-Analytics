from types import SimpleNamespace
import numpy as np
import pytest
from app.vision.detector import parse_result, ModelManager
from app.models.schemas import Settings
from app.config import config
from app.utils.logging import EventLog
from tests.model_fixture import build_synthetic_onnx


class Array:
    def __init__(self, x):
        self.x = np.array(x)

    def cpu(self):
        return self

    def numpy(self):
        return self.x


def test_parser_filters_people_and_invalid_boxes():
    boxes = SimpleNamespace(
        xyxy=Array(
            [[0, 0, 20, 20], [1, 1, 10, 12], [2, 1, 0, 0], [float("nan"), 1, 10, 10]]
        ),
        conf=Array([0.8, 0.9, 0.8, 0.9]),
        cls=Array([0, 1, 0, 0]),
    )
    result = SimpleNamespace(boxes=boxes, masks=None)
    parsed = parse_result(result, {0})
    assert len(parsed) == 1 and parsed[0].class_name == "drone"


def test_yolo_onnx_real_runtime_with_synthetic_image(monkeypatch):
    import torch
    import onnxruntime

    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    monkeypatch.setattr(
        onnxruntime, "get_available_providers", lambda: ["CPUExecutionProvider"]
    )
    path = config.model_dir / "synthetic_fixture.onnx"
    build_synthetic_onnx(path)
    manager = ModelManager(EventLog())
    manager.load(path.name, "auto")
    image = np.zeros((640, 640, 3), np.uint8)
    image[275:325, 260:340] = (0, 0, 255)
    detections = manager.detect(image, Settings())
    assert len(detections) == 1
    assert (detections[0].bbox[0] + detections[0].bbox[2]) / 2 == pytest.approx(
        299.5, abs=2
    )
    assert manager.device == "cpu"
    assert manager.detect(np.zeros_like(image), Settings()) == []


def test_model_rejects_unsafe_path():
    manager = ModelManager(EventLog())
    with pytest.raises(ValueError):
        manager.load("../evil.pt")


def test_gpu_runtime_failure_falls_back_to_cpu():
    class FailOnce:
        def __init__(self):
            self.calls = []

        def predict(self, frame, **kwargs):
            self.calls.append(kwargs["device"])
            if len(self.calls) == 1:
                raise RuntimeError("simulated CUDA allocation failure")
            return [SimpleNamespace(boxes=None, masks=None)]

    manager = ModelManager(EventLog())
    manager.model = FailOnce()
    manager.device = "cuda:0"
    manager.allowed_ids = {0}
    assert manager.detect(np.zeros((64, 64, 3), np.uint8), Settings()) == []
    assert manager.model.calls == ["cuda:0", "cpu"]
    assert manager.device == "cpu"
