Put trusted drone-trained `drone_detector.pt` or a YOLO-compatible `.onnx` here.
No trained drone weights are included in this source package.

Demo Mode uses deterministic geometry and requires no model weights. It still runs
through the real ByteTrack/TrackManager/motion/analytics pipeline.

Accepted class labels: `drone`, `drones`, `uav`, `quadcopter`,
`unmanned aerial vehicle`, `unmanned aircraft` (case-insensitive).
Other classes are excluded from inference output; a model without an accepted
class is rejected. Do not relabel COCO classes as drones.

PT checkpoints may execute Python on load: install only weights you trust.
Browser PT upload is disabled unless the operator sets `ALLOW_PT_UPLOAD=true`.
ONNX uploads reject external tensor references. Prefer ONNX for untrusted delivery,
but still run model inference in an isolated service.

See `docs/MODEL_TRAINING.md` for data preparation, training, evaluation, and export.
