# Deployment and operational guide

## Deployment boundary

Use the supplied single-worker backend behind Nginx. Local development binds to
127.0.0.1. Docker binds published ports to loopback too. Before providing remote
access, configure a strong server `API_KEY`, exact `CORS_ORIGINS`, TLS, upstream
access control, storage backups, retention, and an explicitly isolated camera
network. The key grants access to the entire operator workspace; it is not a
multi-user role system. The UI stores it only in sessionStorage, not URL queries.

The application has no remote shell endpoint and never executes upload filenames
as commands. PT model files are executable artifacts and only trusted operator
weights should be loaded. Browser PT upload is disabled by default. Consider a
separate sandboxed model service for less-trusted model providers.

## CPU Compose

`docker compose up --build` uses PostgreSQL and three services. Backend and frontend
containers use non-root users. The backend performs health checks; frontend waits
for readiness. Model seeds are mounted read-only from `backend/models`, then copied
into a writable named volume at startup. Existing names are not overwritten:
choose a new basename to install a new model version. Uploads are retained there.

Persisted volumes:

- `vision_data`: source uploads, recorded JPEG frames and export folders.
- `vision_models`: installed and uploaded models.
- `postgres_data`: session/track/telemetry/settings database.

Restore the database and corresponding `vision_data` together, so frame references
remain valid. The demo startup requires tracking dependencies but no model file.
Nginx serves the built frontend and proxies REST, docs and upgraded WebSockets.
For larger uploads, keep Nginx `client_max_body_size` and backend limits aligned.

## GPU configuration

Install NVIDIA drivers and the NVIDIA Container Toolkit on the host. Check the
PyTorch installation selector for a CUDA wheel index compatible with the pinned
PyTorch version and your driver. `docker-compose.gpu.yml` makes this index
configurable through `TORCH_GPU_INDEX_URL` and requests one GPU.

```bash
# Use the CUDA index appropriate to your installed driver / PyTorch version.
export TORCH_GPU_INDEX_URL=https://download.pytorch.org/whl/cu130
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

PowerShell environment syntax:

```powershell
$env:TORCH_GPU_INDEX_URL = "https://download.pytorch.org/whl/cu130"
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

The CUDA wheel index shown is a configurable starting point, not a verified GPU
matrix. GPU/container execution was not available in the build environment.
Verify `torch.cuda.is_available()` inside your built container and the dashboard's
reported device. CUDA unavailability falls back to CPU. A model-load or inference
RuntimeError on a selected GPU also triggers a CPU retry. ONNX Runtime's default
package here is CPU; configure its GPU variant separately when needed.

PyTorch selector: https://pytorch.org/get-started/locally/
NVIDIA toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html

## Limits and monitoring

Configure session frame quota, recording byte quota, upload limits, low frame
rates, model size and object limits for the machine. The service attempts real-time
processing at the selected ceiling and exposes actual FPS. It does not promise
30 FPS independent of model, input or hardware. Slow clients receive the latest
snapshot instead of unbounded backlog. Browser camera producers use backpressure.

Rate limiting is per immediate client IP in-process, not a distributed gateway
policy. Reverse proxy deployments should add upstream limits and protect HTTP
multipart parsing, connection counts and request duration. Do not trust a public
client-supplied forwarding header to bypass local limits. Application event logs
are bounded; backend stdout should be collected by your process supervisor.

Unexpected process termination may lose the last approximately one-second DB
batch. SQLite uses WAL locally. Protect data and model volumes with access controls,
filesystem quotas and backups. Delete old sessions using the API rather than
removing JPEG folders alone. Remove unused uploaded source assets with the service
stopped. Recordings contain source imagery and may have privacy obligations even
though the detector only tracks UAV classes.

## Scaling

Do not use multiple Uvicorn workers with the in-process engine. Each camera stream
needs its own ordered inference state. For multiple streams, deploy independent
instances with isolated source/session ownership. GPU scheduling, tenant auth,
queues, orchestration, monitoring integration and zero-downtime schema migrations
need deployment-specific engineering; they are not represented as working buttons.
