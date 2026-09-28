"""Test-only ONNX image detector: finds red pixels in synthetic frames.
This is an executable inference fixture, NOT trained drone detection weights.
"""

import numpy as np
import onnx
from onnx import helper as h, TensorProto as T, numpy_helper as nh


def build_synthetic_onnx(path):
    constants = []

    def c(name, value, dtype=np.float32):
        constants.append(nh.from_array(np.asarray(value, dtype=dtype), name))
        return name

    nodes = []

    def op(kind, inputs, output, **kwargs):
        nodes.append(h.make_node(kind, inputs, [output], **kwargs))
        return output

    c("rindex", [0], np.int64)
    c("gindex", [1], np.int64)
    c("threshold", 0.6)
    c("green_limit", 0.35)
    op("Gather", ["images", "rindex"], "red", axis=1)
    op("Gather", ["images", "gindex"], "green", axis=1)
    op("Greater", ["red", "threshold"], "isred")
    op("Less", ["green", "green_limit"], "notgreen")
    op("And", ["isred", "notgreen"], "maskbool")
    op("Cast", ["maskbool"], "mask", to=T.FLOAT)
    grid = np.arange(640, dtype=np.float32)
    c("xs", grid.reshape(1, 1, 1, 640))
    c("ys", grid.reshape(1, 1, 640, 1))
    op("Mul", ["mask", "xs"], "weighted_x")
    op("Mul", ["mask", "ys"], "weighted_y")
    c("axes", [0, 1, 2, 3], np.int64)
    for a, b in [("mask", "mass"), ("weighted_x", "sumx"), ("weighted_y", "sumy")]:
        op("ReduceSum", [a, "axes"], b, keepdims=0)
    c("one", 1.0)
    op("Max", ["mass", "one"], "safe_mass")
    op("Div", ["sumx", "safe_mass"], "cx")
    op("Div", ["sumy", "safe_mass"], "cy")
    c("width", 80.0)
    c("height", 50.0)
    c("score", 0.98)
    c("minmass", 2.0)
    op("Greater", ["mass", "minmass"], "present")
    op("Cast", ["present"], "presence", to=T.FLOAT)
    op("Mul", ["presence", "score"], "confidence")
    c("newaxis", [0], np.int64)
    for name in ["cx", "cy", "width", "height", "confidence"]:
        op("Unsqueeze", [name, "newaxis"], name + "1")
    op("Concat", ["cx1", "cy1", "width1", "height1", "confidence1"], "vector", axis=0)
    c("shape", [1, 5, 1], np.int64)
    op("Reshape", ["vector", "shape"], "onebox")
    # YOLO's shape heuristic expects more candidates than classes+coordinates.
    c("empty", np.zeros((1, 5, 9), np.float32))
    op("Concat", ["onebox", "empty"], "output0", axis=2)
    graph = h.make_graph(
        nodes,
        "synthetic-red-pixel-test",
        [h.make_tensor_value_info("images", T.FLOAT, [1, 3, 640, 640])],
        [h.make_tensor_value_info("output0", T.FLOAT, [1, 5, 10])],
        constants,
    )
    model = h.make_model(graph, opset_imports=[h.make_opsetid("", 17)])
    model.ir_version = 10
    h.set_model_props(
        model,
        {
            "stride": "32",
            "task": "detect",
            "batch": "1",
            "imgsz": "[640,640]",
            "names": "{0: 'drone'}",
            "description": "SYNTHETIC TEST FIXTURE — not drone-trained weights",
            "end2end": "False",
        },
    )
    onnx.checker.check_model(model)
    onnx.save(model, str(path))
