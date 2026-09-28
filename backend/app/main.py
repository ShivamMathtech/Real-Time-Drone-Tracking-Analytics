import time, secrets, logging
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from app.config import config
from app.database.db import initialize
from app.vision.engine import VisionEngine
from app.api.routes import router as api_router
from app.websocket.routes import router as websocket_router

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)


@asynccontextmanager
async def lifespan(app):
    initialize()
    app.state.engine = VisionEngine()
    app.state.camera_client = False
    yield
    await run_in_threadpool(app.state.engine.close)


app = FastAPI(
    title="MathTech Drone Vision",
    version="1.0.0",
    description="Civilian UAV vision and image-space motion analytics. One shared source per deployment.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in config.cors_origins.split(",")],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)
requests = defaultdict(deque)


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.url.path.startswith("/api") and request.method != "OPTIONS":
        if (
            config.api_key
            and request.url.path != "/api/health"
            and not secrets.compare_digest(
                request.headers.get("x-api-key", ""), config.api_key
            )
        ):
            return JSONResponse({"detail": "API key required"}, status_code=401)
        key = request.client.host if request.client else "local"
        now = time.monotonic()
        q = requests[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= (2400 if request.method == "GET" else 360):
            return JSONResponse(
                {"detail": "Rate limit exceeded; retry shortly"},
                status_code=429,
                headers={"Retry-After": "10"},
            )
        q.append(now)
        if len(requests) > 4096:
            for k in list(requests):
                if not requests[k] or now - requests[k][-1] > 60:
                    requests.pop(k, None)
        length = request.headers.get("content-length")
        if length and (
            not length.isdigit()
            or int(length) > (config.max_upload_mb + 2) * 1024 * 1024
        ):
            return JSONResponse(
                {"detail": "Upload exceeds configured size"}, status_code=413
            )
    try:
        response = await call_next(request)
    except Exception:
        logging.getLogger("dronevision").exception("Request failed")
        return JSONResponse(
            {"detail": "The operation failed. Check server logs."}, status_code=500
        )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


app.include_router(api_router)
app.include_router(websocket_router)
