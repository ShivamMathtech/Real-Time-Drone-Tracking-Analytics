# Training and installing a drone detector

## Dataset requirements

Use a dataset of **drones visible in camera images**, with valid rights for your
intended usage. A dataset photographed _from_ a drone may instead annotate people
and vehicles; that is not automatically a drone-detection dataset. This package
does not download external datasets or trained weights.

Required YOLO layout:

```text
drone-dataset/
  images/train/  images/val/  images/test/
  labels/train/  labels/val/  labels/test/
```

Each label row is `class_id center_x center_y width height`, normalized to `[0,1]`.
Use class 0 named `drone`. Train with both positive and negative scenes: birds,
airplanes, kites, distant structures, glare and empty skies. Label small and partly
occluded drones consistently. Use human-reviewed labels.

Split by original flight, recording date, camera, site and weather condition.
Adjacent frames from the same clip must not leak between train and test splits.
Include the target resolution, motion blur, scale distribution and camera geometry.

Copy and edit `backend/models/drone-dataset.example.yaml`.

## Train

The helper defaults to architecture YAML, so it starts from scratch without an
implicit checkpoint download:

```bash
python scripts/train_drone_model.py --data /path/to/drone.yaml \
  --base yolo11n.yaml --epochs 100 --imgsz 960 --batch 8 --device cpu
```

For transfer learning, supply a trusted local pretrained checkpoint as `--base`.
For CUDA use a compatible PyTorch installation and `--device 0`. Starting from
scratch on a small dataset is usually inadequate; the command is a workflow,
not a guarantee of accuracy. Tune with validation data, not the held-out test set.

A direct Ultralytics command is also possible:

```bash
yolo detect train model=/path/to/trusted-base.pt data=/path/to/drone.yaml epochs=100 imgsz=960
yolo detect val model=runs/detect/train/weights/best.pt data=/path/to/drone.yaml split=test
```

Paths in the output depend on which command you used. Copy the resulting trained
`best.pt` to `backend/models/drone_detector.pt`. Select it in Settings after closing
an active source. For initial automatic loading, set `MODEL_PATH=drone_detector.pt`.

## Export ONNX

Use a detector already trained to recognize drones:

```bash
yolo export model=backend/models/drone_detector.pt format=onnx imgsz=640 dynamic=True simplify=False nms=False
```

Use a self-contained export with YOLO metadata (`names`, `task`, `stride`, `imgsz`).
The model manager accepts detection and segmentation tasks. External tensor-file
references are rejected. Postprocessing expects an Ultralytics-compatible export;
arbitrary ONNX networks are not interchangeable. ONNX Runtime CPU is installed by
default. CUDA-enabled ONNX Runtime requires a separately compatible package/runtime
installation; the standard CPU ONNX path remains functional.

A segmentation model must be trained with actual UAV masks. Detection bounding
boxes are not relabeled as pixel segmentation. DeepSORT mode currently emits boxes;
choose ByteTrack to retain segmentation polygons in the dashboard.

## Evaluate before real research claims

Report precision, recall, AP50 and AP50–95 on held-out data, per drone-size bucket,
plus false positives per minute. Report IDF1/HOTA or ID switches and track
fragmentation on labeled sequences, not only object-detection AP. Measure detection
latency and end-to-end FPS at the actual model/input/hardware combination. Record
confidence calibration, occlusion duration, camera motion and failure examples.

Image-space motion includes camera motion. Metric speed needs camera calibration,
geometry, depth/scale and time synchronization; no such calibration is fabricated
by this implementation. Test sensor-to-track association before accepting GPS or
altitude as belonging to an observed drone.

The synthetic ONNX model in `backend/tests/model_fixture.py` detects red test pixels
and exists only to test the runtime contract. It must never be deployed or described
as a trained drone detector.

## Primary references

- Ultralytics tracking: https://docs.ultralytics.com/modes/track/
- Ultralytics training: https://docs.ultralytics.com/modes/train/
- Ultralytics export: https://docs.ultralytics.com/modes/export/
- Official ByteTrack source: https://github.com/ifzhang/ByteTrack
- Deep SORT source: https://github.com/nwojke/deep_sort
- Ultralytics license information: https://www.ultralytics.com/license
