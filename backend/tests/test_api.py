import time, json, csv, io, cv2, numpy as np, pytest
from app.config import config
from tests.model_fixture import build_synthetic_onnx


def wait_frame(client, minimum=5):
    with client.websocket_connect("/ws/tracking") as ws:
        ws.send_json({"api_key": ""})
        for _ in range(200):
            packet = ws.receive_json()
            if packet.get("frame_index", -1) >= minimum and packet.get("frame"):
                return packet
    raise AssertionError("No processed frame")


def test_health_api_schema_and_invalid_input(client):
    assert client.get("/api/health").json()["status"] == "online"
    assert "/ws/tracking" not in client.get("/openapi.json").json()["paths"]
    assert client.post("/api/source/start", json={"kind": "shell"}).status_code == 422
    assert (
        client.post(
            "/api/source/start", json={"kind": "file", "asset_id": "../../etc/passwd"}
        ).status_code
        == 400
    )
    assert client.get("/api/session/not-a-uuid").status_code == 422
    assert (
        client.post(
            "/api/source/start", json={"kind": "rtsp", "url": "rtsp://127.0.0.1/test"}
        ).status_code
        == 400
    )


def test_demo_websocket_session_and_exports(client):
    assert client.post("/api/source/start", json={"kind": "demo"}).status_code == 200
    client.post("/api/session/record", json={"enabled": True})
    p = wait_frame(client)
    assert len(p["objects"]) == 3 and p["data_source"] == "simulation"
    assert p["fps"] > 0 and p["latency_ms"] >= 0
    assert all(o["velocity"]["unit"] == "px/s" for o in p["objects"])
    assert p["telemetry"] == {}
    assert client.get("/api/tracks/1").status_code == 200
    assert client.post("/api/tracking/select", json={"track_id": 2}).status_code == 200
    session = client.post("/api/session/save", json={"name": "Integration demo"}).json()
    sid = session["id"]
    client.post("/api/source/stop")
    detail = client.get("/api/session/" + sid).json()
    assert detail["session"]["saved"] and len(detail["frames"]) > 0
    recorded = next(f for f in detail["frames"] if f["has_image"])
    assert (
        client.get(f"/api/session/{sid}/frame/{recorded['frame_index']}").headers[
            "content-type"
        ]
        == "image/jpeg"
    )
    exported = client.get("/api/export/" + sid + "?format=json").json()
    assert exported["schema_version"] == 1
    csvrows = list(
        csv.DictReader(
            io.StringIO(client.get("/api/export/" + sid + "?format=csv").text)
        )
    )
    assert (
        len(csvrows) >= 3
        and {"velocity_x", "confidence", "track_id"} <= csvrows[0].keys()
    )
    assert all(r["source"] == "simulation" for r in csvrows)
    assert "MathTech" in client.get("/api/export/" + sid + "?format=report").text
    assert client.get("/api/sessions").status_code == 200
    assert client.delete("/api/session/" + sid).status_code == 200
    assert client.get("/api/session/" + sid).status_code == 404


def test_pause_settings_and_reconnect(client):
    client.post("/api/source/start", json={"kind": "demo"})
    first = wait_frame(client, 2)
    client.post("/api/source/playback", json={"action": "pause"})
    old = client.app.state.engine.frame_index
    time.sleep(0.15)
    assert client.app.state.engine.frame_index == old
    client.post("/api/source/playback", json={"action": "play"})
    second = wait_frame(client, old + 2)
    assert second["session_id"] == first["session_id"]
    settings = client.get("/api/settings").json()
    settings["kalman"] = False
    settings["trail_length"] = 30
    assert client.put("/api/settings", json=settings).json()["kalman"] is False
    assert client.post("/api/tracking/reset").status_code == 200
    assert client.post("/api/tracking/history/clear").status_code == 200
    assert client.get("/api/logs?level=INFO").json()


def test_upload_validates_content_not_only_extension(client):
    r = client.post(
        "/api/video/upload", files={"file": ("bad.mp4", b"not a video", "video/mp4")}
    )
    assert r.status_code == 400
    assert (
        client.post(
            "/api/video/upload",
            files={"file": ("bad.exe", b"123", "application/octet-stream")},
        ).status_code
        == 415
    )
    assert (
        client.post(
            "/api/models/upload", files={"file": ("unsafe.pt", b"123")}
        ).status_code
        == 415
    )


def test_video_to_onnx_tracking_websocket_export(client, tmp_path):
    model = config.model_dir / "synthetic_video_fixture.onnx"
    build_synthetic_onnx(model)
    assert (
        client.post("/api/models/load", json={"filename": model.name}).status_code
        == 200
    )
    path = tmp_path / "red-drone-fixture.avi"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 20, (640, 640))
    for i in range(24):
        frame = np.zeros((640, 640, 3), np.uint8)
        frame[280:320, 100 + i * 4 : 160 + i * 4] = (0, 0, 255)
        writer.write(frame)
    writer.release()
    with path.open("rb") as f:
        response = client.post(
            "/api/video/upload",
            files={"file": ("red-drone-fixture.avi", f, "video/x-msvideo")},
        )
    assert response.status_code == 200, response.text
    asset = response.json()
    assert asset["fps"] == 20
    assert (
        client.post(
            "/api/source/start", json={"kind": "file", "asset_id": asset["asset_id"]}
        ).status_code
        == 200
    )
    p = wait_frame(client, 5)
    assert p["objects"] and p["objects"][0]["velocity"]["speed"] > 0
    assert (
        p["objects"][0]["source"] == "vision"
    )  # Actual inference of synthetic test pixels.
    assert p["latency_ms"] > 0 and p["device"] == "CPU"
    sid = p["session_id"]
    client.post("/api/source/stop")
    rows = list(csv.DictReader(io.StringIO(client.get("/api/export/" + sid).text)))
    assert len(rows) > 3 and len({r["track_id"] for r in rows}) == 1


def test_browser_camera_websocket_jpeg(client):
    settings = client.get("/api/settings").json()
    settings["frame_skip"] = 2
    assert client.put("/api/settings", json=settings).status_code == 200
    client.post("/api/source/start", json={"kind": "webcam"})
    image = np.zeros((240, 320, 3), np.uint8)
    ok, data = cv2.imencode(".jpg", image)
    with client.websocket_connect("/ws/camera") as ws:
        ws.send_json({"api_key": ""})
        ws.send_json({"timestamp": 1})
        ws.send_bytes(data.tobytes())
        assert ws.receive_json()["accepted"]
    p = wait_frame(client, 0)
    assert p["source"] == "webcam" and p["width"] == 320


def test_unauthorized_websocket_origin(client):
    with pytest.raises(Exception):
        with client.websocket_connect(
            "/ws/tracking", headers={"origin": "https://evil.example"}
        ) as ws:
            ws.send_json({})


def test_api_key_authentication(client, monkeypatch):
    from starlette.websockets import WebSocketDisconnect

    monkeypatch.setattr(config, "api_key", "local-test-key")
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/settings").status_code == 401
    assert (
        client.get("/api/settings", headers={"X-API-Key": "local-test-key"}).status_code
        == 200
    )
    with client.websocket_connect("/ws/tracking") as ws:
        ws.send_json({"api_key": "local-test-key"})
        assert "seq" in ws.receive_json()
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/tracking") as ws:
            ws.send_json({"api_key": "wrong"})
            ws.receive_json()
