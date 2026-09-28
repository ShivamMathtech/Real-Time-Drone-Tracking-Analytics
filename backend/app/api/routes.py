import asyncio, html, json, time, uuid, re, io
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Request, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from starlette.concurrency import run_in_threadpool
from app.config import config
from app.models.schemas import *
from app.vision.sources import FileSource

router = APIRouter(prefix="/api")


def engine(request: Request):
    return request.app.state.engine


def public_error(exc):
    if isinstance(exc, ValueError):
        return HTTPException(400, str(exc))
    return HTTPException(
        400, "Operation failed. Check source/model compatibility and the server logs."
    )


@router.get("/health", response_model=Health)
def health(request: Request):
    e = engine(request)
    return dict(
        status="online",
        version="1.0.0",
        device=e.models.device.upper(),
        model_ready=e.models.model is not None,
        authentication=bool(config.api_key),
        engine_status=e.status,
    )


@router.get("/models", response_model=ModelInfo)
def models(request: Request):
    return engine(request).models.info()


@router.post("/models/load", response_model=ModelInfo)
def load_model(payload: ModelRequest, request: Request):
    e = engine(request)
    try:
        e.load_model(payload.filename)
    except Exception as ex:
        raise public_error(ex)
    return e.models.info()


async def store_upload(
    file: UploadFile, folder: Path, limit: int, extensions: set[str]
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in extensions:
        raise HTTPException(415, "Unsupported file extension")
    asset_id = uuid.uuid4().hex
    path = folder / (asset_id + suffix)
    size = 0
    try:
        with path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit * 1024 * 1024:
                    raise HTTPException(413, f"File exceeds {limit} MB limit")
                await run_in_threadpool(output.write, chunk)
        if size == 0:
            raise HTTPException(400, "Empty upload")
        return asset_id, path
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.post("/video/upload", response_model=Asset)
async def upload_video(file: UploadFile = File(...)):
    name = Path(file.filename or "video").name[:160]
    asset_id, path = await store_upload(
        file,
        config.data_dir / "videos",
        config.max_upload_mb,
        {".mp4", ".webm", ".avi", ".mov", ".mkv"},
    )

    def validate():
        source = FileSource(path)
        try:
            metadata = source.metadata()
            if source.read() is None:
                raise ValueError("Video has no decodable frames")
            return metadata
        finally:
            source.close()

    try:
        metadata = await run_in_threadpool(validate)
    except Exception as ex:
        path.unlink(missing_ok=True)
        raise public_error(ex)
    return dict(asset_id=asset_id, name=name, **metadata)


@router.post("/models/upload", response_model=ModelInfo)
async def upload_model(request: Request, file: UploadFile = File(...)):
    extensions = {".onnx", ".pt"} if config.allow_pt_upload else {".onnx"}
    asset_id, path = await store_upload(
        file, config.model_dir, config.max_model_mb, extensions
    )
    if path.suffix == ".onnx":
        try:

            def validate():
                import onnx

                model = onnx.load(str(path), load_external_data=False)
                if any(
                    t.data_location == onnx.TensorProto.EXTERNAL
                    for t in model.graph.initializer
                ):
                    raise ValueError("External ONNX tensor files are not accepted")
                onnx.checker.check_model(model)

            await run_in_threadpool(validate)
        except Exception:
            path.unlink(missing_ok=True)
            raise HTTPException(400, "Invalid or unsupported ONNX model")
    engine(request).log.add(
        "Model uploaded; select it to validate drone classes", category="model"
    )
    return engine(request).models.info()


@router.post("/source/start", response_model=Packet)
def start_source(payload: SourceRequest, request: Request):
    try:
        return engine(request).start(payload)
    except Exception as ex:
        raise public_error(ex)


@router.post("/source/stop", response_model=Result)
def stop_source(request: Request):
    engine(request).stop()
    return Result(message="Source stopped")


@router.post("/source/playback", response_model=Result)
def playback(payload: PlaybackRequest, request: Request):
    try:
        engine(request).playback(payload)
    except Exception as ex:
        raise public_error(ex)
    return Result()


@router.post("/tracking/start", response_model=Result)
def start_tracking(request: Request):
    try:
        engine(request).tracking_action(True)
    except Exception as ex:
        raise public_error(ex)
    return Result()


@router.post("/tracking/stop", response_model=Result)
def stop_tracking(request: Request):
    try:
        engine(request).tracking_action(False)
    except Exception as ex:
        raise public_error(ex)
    return Result()


@router.post("/tracking/reset", response_model=Result)
def reset_tracking(request: Request):
    engine(request).reset()
    return Result()


@router.post("/tracking/history/clear", response_model=Result)
def clear_history(request: Request):
    engine(request).reset(clear_only=True)
    return Result()


@router.post("/tracking/select", response_model=Result)
def select_track(payload: SelectionRequest, request: Request):
    e = engine(request)
    with e.lock:
        if payload.track_id is not None and payload.track_id not in e.manager.states:
            raise HTTPException(404, "Track is no longer active")
        e.selected_track = payload.track_id
        e.status_packet()
    return Result()


@router.get("/tracks", response_model=list[Track])
def tracks(request: Request):
    return engine(request).snapshot()["objects"]


@router.get("/tracks/{track_id}", response_model=Track)
def track(track_id: int, request: Request):
    for item in engine(request).snapshot()["objects"]:
        if item["id"] == track_id:
            return item
    raise HTTPException(404, "Track not found")


@router.get("/settings", response_model=Settings)
def settings(request: Request):
    return engine(request).settings


@router.put("/settings", response_model=Settings)
def update_settings(payload: Settings, request: Request):
    try:
        engine(request).update_settings(payload)
    except Exception as ex:
        raise public_error(ex)
    return payload


@router.post("/telemetry", response_model=Result)
def telemetry(payload: TelemetryInput, request: Request):
    e = engine(request)
    with e.lock:
        if payload.track_id not in e.manager.states:
            raise HTTPException(404, "Associate telemetry with an active track ID")
        try:
            e.custom_telemetry.ingest(payload)
        except ValueError as ex:
            raise HTTPException(422, str(ex))
    return Result()


@router.get("/logs", response_model=list[LogEntry])
def logs(
    request: Request,
    level: Literal["INFO", "WARNING", "ERROR"] | None = None,
    after: int = Query(0, ge=0),
):
    return engine(request).log.get(level, after)


@router.post("/session/record", response_model=Result)
def record(payload: RecordRequest, request: Request):
    e = engine(request)
    with e.lock:
        if not e.source or e.status not in ("running", "paused"):
            raise HTTPException(400, "Start a source before recording")
        e.recording = payload.enabled
        e.status_packet()
        e.log.add(
            "Frame recording " + ("started" if payload.enabled else "stopped"),
            category="session",
        )
    return Result()


@router.post("/session/save", response_model=SessionInfo)
def save_session(payload: SaveRequest, request: Request):
    e = engine(request)
    with e.lock:
        try:
            return e.repo.save(e.session_id, payload.name)
        except Exception as ex:
            raise public_error(ex)


@router.get("/sessions", response_model=list[SessionInfo])
def sessions(request: Request):
    e = engine(request)
    with e.lock:
        e.repo.flush()
        return e.repo.list()


@router.get("/session/{session_id}", response_model=SessionDetail)
def session(
    session_id: uuid.UUID,
    request: Request,
    offset: int = Query(0, ge=0),
    limit: int = Query(300, ge=1, le=1000),
):
    e = engine(request)
    with e.lock:
        e.repo.flush()
        try:
            return e.repo.frames(str(session_id), offset, limit)
        except ValueError as ex:
            raise HTTPException(404, str(ex))


@router.get("/session/{session_id}/frame/{frame_index}", response_class=FileResponse)
def session_frame(session_id: uuid.UUID, frame_index: int, request: Request):
    try:
        return FileResponse(
            engine(request).repo.image(str(session_id), frame_index),
            media_type="image/jpeg",
        )
    except ValueError as ex:
        raise HTTPException(404, str(ex))


@router.delete("/session/{session_id}", response_model=Result)
def delete_session(session_id: uuid.UUID, request: Request):
    e = engine(request)
    with e.lock:
        if str(session_id) == e.session_id and e.source is not None:
            raise HTTPException(
                409, "Stop the active source before deleting its session"
            )
        try:
            e.repo.delete(str(session_id))
        except ValueError as ex:
            raise HTTPException(404, str(ex))
    return Result()


@router.get("/export/{session_id}")
def export(
    session_id: uuid.UUID,
    request: Request,
    format: Literal["csv", "json", "report"] = "csv",
):
    e = engine(request)
    sid = str(session_id)
    with e.lock:
        e.repo.flush()
        try:
            session = e.repo.get(sid)
        except ValueError as ex:
            raise HTTPException(404, str(ex))
    if format == "report":
        rows = "".join(
            f"<tr><td>{html.escape(k.replace('_', ' '))}</td><td>{html.escape(str(round(v, 3) if isinstance(v, float) else v))}</td></tr>"
            for k, v in session["statistics"].items()
        )
        body = f"""<!doctype html><html lang="en"><meta charset="utf-8"><title>MathTech session report</title><style>body{{font:16px system-ui;max-width:850px;margin:60px auto;color:#172436}}h1{{color:#067caf}}td{{padding:12px;border-bottom:1px solid #ccd}}table{{width:100%}}small{{color:#456}}</style><h1>MATH TECH DRONE VISION</h1><h2>{html.escape(session["name"])}</h2><p>Session {sid}</p><p>Source: {html.escape(session["source"])} · Model: {html.escape(session["model"])} · Tracker: {html.escape(session["algorithm"])}</p><p>All vision motion uses image pixels and pixels/second. Direction: 0° right, 90° down. Demo values are simulated. Sensor telemetry is separately tagged. Counts are detection observations, not unique aircraft identities.</p><table>{rows}</table><p>Prepared with MathTech · I HAVE NO LIMITATION</p></html>"""
        return HTMLResponse(
            body,
            headers={
                "Content-Disposition": f'attachment; filename="{sid}-report.html"'
            },
        )
    return StreamingResponse(
        e.repo.iter_export(sid, format),
        media_type="application/json" if format == "json" else "text/csv",
        headers={"Content-Disposition": f'attachment; filename="{sid}.{format}"'},
    )
