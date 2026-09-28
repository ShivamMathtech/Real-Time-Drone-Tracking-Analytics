"""Seed trusted operator weights into the writable model volume, then start Uvicorn."""

import os
import shutil
import sys
from pathlib import Path

models = Path(os.environ.get("MODEL_DIR", "/app/models"))
models.mkdir(parents=True, exist_ok=True)
for source in Path("/opt/model-seed").glob("*"):
    if source.is_file() and source.suffix.lower() in {".pt", ".onnx"}:
        destination = models / source.name
        if not destination.exists():
            shutil.copyfile(source, destination)
os.execvp(sys.argv[1], sys.argv[1:])
