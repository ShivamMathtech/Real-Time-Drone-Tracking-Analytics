"""Package source, documentation, sample data and the validated frontend build."""

from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {
    "node_modules",
    ".git",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    "test-results",
    "playwright-report",
}


def include(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    if any(part in EXCLUDED for part in relative.parts):
        return False
    if (
        path.name in {".env", ".env.local"}
        or path.suffix in {".pyc", ".tsbuildinfo", ".db", ".pt", ".onnx"}
        or ".db-" in path.name
    ):
        return False
    if relative.parts[0] == "data":
        return path.name in {
            ".gitkeep",
            "synthetic-drone-trajectories.mp4",
            "synthetic-ground-truth.json",
        }
    return path.is_file()


def main():
    files = sorted(path for path in ROOT.rglob("*") if include(path))
    manifest = ROOT / "docs" / "FILE_MANIFEST.txt"
    manifest.write_text(
        "\n".join(str(p.relative_to(ROOT)) for p in files if p != manifest)
        + "\ndocs/FILE_MANIFEST.txt\n"
    )
    files = sorted(path for path in ROOT.rglob("*") if include(path))
    output = ROOT.parent / "MathTech-Drone-Vision-v1.0.0-Source.zip"
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, Path("drone-vision") / path.relative_to(ROOT))
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert "drone-vision/README.md" in archive.namelist()
        assert "drone-vision/frontend/dist/index.html" in archive.namelist()
    print(
        json.dumps(
            {
                "file": str(output),
                "files": len(files),
                "bytes": output.stat().st_size,
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
