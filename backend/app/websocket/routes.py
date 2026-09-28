import asyncio, io, time, secrets, cv2, numpy as np
from urllib.parse import urlparse
from PIL import Image
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool
from app.config import config

router = APIRouter()


async def authenticate(ws):
    origin = ws.headers.get("origin")
    allowed = {v.strip() for v in config.cors_origins.split(",")}
    if (
        origin
        and origin not in allowed
        and urlparse(origin).netloc != ws.headers.get("host")
    ):
        await ws.close(code=1008)
        return False
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=8)
        if config.api_key and not secrets.compare_digest(
            str(first.get("api_key", "")), config.api_key
        ):
            await ws.close(code=1008)
            return False
    except Exception:
        await ws.close(code=1008)
        return False
    return True


@router.websocket("/ws/tracking")
async def tracking_socket(ws: WebSocket):
    if not await authenticate(ws):
        return
    e = ws.app.state.engine
    last_seq = -1
    last_log = 0
    try:
        while True:
            packet = await run_in_threadpool(e.snapshot)
            logs = e.log.get(after=last_log)
            if packet["seq"] != last_seq or logs:
                await asyncio.wait_for(
                    ws.send_json({**packet, "logs": logs}), timeout=5
                )
                last_seq = packet["seq"]
                if logs:
                    last_log = logs[-1]["id"]
            else:
                # Heartbeat ensures closed clients are released even when the source is idle.
                await asyncio.wait_for(
                    ws.send_json({"type": "heartbeat", "timestamp": time.time()}),
                    timeout=5,
                )
            await asyncio.sleep(0.05 if e.status == "running" else 0.5)
    except (WebSocketDisconnect, RuntimeError, asyncio.TimeoutError):
        pass


@router.websocket("/ws/camera")
async def camera_socket(ws: WebSocket):
    if not await authenticate(ws):
        return
    e = ws.app.state.engine
    if getattr(ws.app.state, "camera_client", False):
        await ws.send_json({"error": "Another camera producer is connected"})
        await ws.close(code=1008)
        return
    ws.app.state.camera_client = True
    last = 0.0
    try:
        while True:
            meta = await asyncio.wait_for(ws.receive_json(), timeout=20)
            data = await asyncio.wait_for(ws.receive_bytes(), timeout=10)
            if len(data) > config.max_frame_bytes:
                raise ValueError("Camera frame exceeds limit")
            if time.monotonic() - last < 1 / 65:
                raise ValueError("Camera frame rate exceeds limit")
            last = time.monotonic()

            def decode():
                with Image.open(io.BytesIO(data)) as im:
                    if im.format != "JPEG" or im.width * im.height > 1920 * 1080:
                        raise ValueError("Use JPEG camera frames up to 1920×1080")
                frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
                if frame is None:
                    raise ValueError("Invalid JPEG frame")
                e.enqueue_camera(frame, float(meta["timestamp"]))

            await run_in_threadpool(decode)
            await ws.send_json({"accepted": True})
    except (WebSocketDisconnect, RuntimeError, asyncio.TimeoutError):
        pass
    except Exception:
        try:
            await ws.send_json(
                {
                    "error": "Camera frame rejected. Check source, timestamp and image dimensions."
                }
            )
            await ws.close(code=1008)
        except RuntimeError:
            pass
    finally:
        ws.app.state.camera_client = False
