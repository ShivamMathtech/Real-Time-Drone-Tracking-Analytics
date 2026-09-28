# REST and WebSocket contract

FastAPI exposes `/docs`, `/redoc` and `/openapi.json`. The generated
`docs/openapi.json` contains exact Pydantic schemas and operation parameters.

Set `API_KEY` on the server for protected use. REST requests send `X-API-Key`.
The health endpoint stays public; docs reveal schemas but not secret values.
WebSockets authenticate using their first JSON message, never query parameters.

## REST routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Service/device/model readiness |
| GET | `/api/models` | Safe model basenames, loaded classes, capabilities |
| POST | `/api/models/upload` | Multipart `file`; ONNX, trusted PT only if enabled |
| POST | `/api/models/load` | `{ "filename": "drone_detector.pt" }` |
| POST | `/api/video/upload` | Multipart `file`; returns asset ID and metadata |
| POST | `/api/source/start` | SourceRequest described below |
| POST | `/api/source/stop` | Close source; flush session |
| POST | `/api/source/playback` | `{ "action": "play|pause|seek|speed", "value": 1 }` |
| POST | `/api/tracking/start` | Enable detection; requires model except demo |
| POST | `/api/tracking/stop` | Disable detection, leave video preview running |
| POST | `/api/tracking/reset` | Reset associations and allocate fresh IDs |
| POST | `/api/tracking/history/clear` | Clear bounded visible trajectories |
| POST | `/api/tracking/select` | `{ "track_id": 1 }` or null |
| GET | `/api/tracks` | Emitted current tracks |
| GET | `/api/tracks/{track_id}` | One current track, or 404 |
| GET/PUT | `/api/settings` | Read / validate and apply full Settings object |
| POST | `/api/telemetry` | Timestamped metrics linked to active track ID |
| GET | `/api/logs` | Filter with `level=INFO|WARNING|ERROR`, `after=<event_id>` |
| POST | `/api/session/record` | `{ "enabled": true }`; enable JPEG retention |
| POST | `/api/session/save` | `{ "name": "Flight experiment" }` |
| GET | `/api/sessions` | Up to 200 recent sessions |
| GET | `/api/session/{uuid}` | `offset=0&limit=300`; frames + next offset |
| GET | `/api/session/{uuid}/frame/{index}` | Recorded JPEG, otherwise 404 |
| DELETE | `/api/session/{uuid}` | Remove inactive session and associated data |
| GET | `/api/export/{uuid}` | `format=csv|json|report`; streamed download |

Source requests:

```json
{"kind":"demo"}
{"kind":"webcam"}
{"kind":"file","asset_id":"32_character_upload_id"}
{"kind":"rtsp","url":"rtsp://allowlisted-host:554/stream"}
{"kind":"backend_camera","camera_index":0}
```

`seek` is valid only for files. File seek starts a new analysis session. `speed`
accepts 0.25, 0.5, 1, 2, 4 for files/demo; it does not change physical/image velocity
units. Invalid enum values and ranges return 422; invalid operations return 400;
missing resources return 404; protected operations without a key return 401;
rate limits return 429 and oversized uploads return 413.

## Observer WebSocket `/ws/tracking`

Immediately after connection, send:

```json
{"api_key":"your-configured-key-or-empty-string"}
```

Normal message shape (illustrative schema values only):

```json
{
  "seq": 28,
  "timestamp": 1790576000.15,
  "video_time": 1.4,
  "fps": 19.8,
  "latency_ms": 17.2,
  "processing_ms": 23.1,
  "frame_index": 27,
  "width": 960,
  "height": 540,
  "duration": 60,
  "source": "file",
  "source_label": "Uploaded video",
  "data_source": "vision",
  "status": "running",
  "tracking": true,
  "recording": false,
  "playback_speed": 1,
  "model": "drone_detector.pt",
  "device": "CPU",
  "session_id": "UUID",
  "selected_track": 1,
  "objects": [{
    "id": 1,
    "class_name": "drone",
    "confidence": 0.91,
    "bbox": [100, 80, 180, 130],
    "center": [140, 105],
    "timestamp": 1.4,
    "velocity": {"x": 12, "y": -3, "speed": 12.369, "unit": "px/s", "source": "vision"},
    "direction": 345.964,
    "angular_velocity": 0,
    "history": [{"x": 140, "y": 105, "timestamp": 1.4}],
    "status": "tracking",
    "duration": 1.4,
    "path_length": 17.3,
    "avg_speed": 12.3,
    "max_speed": 13.2,
    "source": "vision",
    "predicted_center": null,
    "mask": null
  }],
  "telemetry": {},
  "statistics": {},
  "frame": "base64 JPEG without data URL prefix",
  "error": null,
  "logs": []
}
```

Idle heartbeats have `type: "heartbeat"` and Unix `timestamp`. Treat `seq` as a
change counter; snapshots can skip frames under load. The browser reconnects with
exponential backoff, capped at 10 seconds, then re-authenticates. Status messages
may retain the previous image. Validated HTTP schemas document the full statistics
and telemetry types. `class_name` is used rather than the reserved Python word
`class`; CSV exports use the requested `class` column name.

## Browser camera `/ws/camera`

1. Start the `webcam` source through REST.
2. Open the socket and send the same authentication JSON.
3. Send text JSON `{ "timestamp": <monotonic capture seconds> }`.
4. Send one binary JPEG message.
5. Wait for `{ "accepted": true }` before scheduling the next pair.

The server accepts increasing finite timestamps, JPEGs up to 1920×1080, and a
maximum of `MAX_FRAME_BYTES`. A bounded queue retains the newest pending frame.
An acknowledgement means accepted into the pipeline, not inference completion.
Only one camera producer may connect at once. The source can be previewed without
a detector; Start Tracking requires drone weights. Observer clients use the
separate tracking socket.

## Telemetry input

```json
{
  "track_id": 1,
  "metrics": {
    "altitude": {"value": 62.3, "unit": "m", "timestamp": 1790576000.15, "source": "telemetry"}
  }
}
```

Supported units: altitude `m`; speed `m/s`; heading/latitude/longitude `deg`;
battery/signal `%`. Out-of-range geographic/percentage/heading values are rejected.
Use current Unix timestamps, not the example timestamp. Coordinates are only
associated with the supplied active track ID. Each ingestion replaces that track's
metric set; send all currently available values together. Values expire after TTL.
Simulation is generated by a separate provider and cannot be submitted as measured
telemetry through this endpoint.

## Exports

CSV header:

```text
timestamp,track_id,class,confidence,x,y,width,height,velocity_x,velocity_y,speed,direction,source,units
```

CSV `timestamp` is source-relative time, `x/y` are center coordinates, velocity is
px/s, and direction is image degrees. JSON frame packets additionally contain
wall-clock Unix timestamps, sensor telemetry, status, source metadata, statistics
and masks where available. JSON omits JPEG bytes; recorded image retrieval is a
separate authenticated endpoint. Reports are HTML and support browser print-to-PDF.
