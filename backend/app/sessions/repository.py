import base64, csv, io, json, time, uuid, shutil
from sqlalchemy import select, delete
from app.config import config
from app.database.db import (
    DB,
    SessionRow,
    FrameRow,
    TrackRow,
    PointRow,
    TelemetryRow,
    EventRow,
    SettingRow,
)


class SessionRepository:
    def __init__(self):
        self.pending = []
        self.last_flush = time.monotonic()
        self.recorded_bytes = {}

    def create(self, source, model, algorithm, settings):
        sid = str(uuid.uuid4())
        with DB.begin() as db:
            db.add(
                SessionRow(
                    id=sid,
                    name="Research session " + time.strftime("%Y-%m-%d %H:%M"),
                    started_at=time.time(),
                    source=source,
                    model=model,
                    algorithm=algorithm,
                    meta={
                        "settings": settings,
                        "coordinate_system": "image pixels; origin top-left; 0° right, 90° down",
                        "frame_recording": "optional; JSON analytics are always recorded",
                    },
                )
            )
        return sid

    def append(self, packet, jpeg):
        sid = packet["session_id"]
        clean = {k: v for k, v in packet.items() if k != "frame"}
        clean["objects"] = [
            {k: v for k, v in obj.items() if k != "history"}
            for obj in packet["objects"]
        ]
        image_saved = False
        if (
            packet["recording"]
            and self.recorded_bytes.get(sid, 0) + len(jpeg)
            <= config.max_recording_mb * 1024 * 1024
        ):
            folder = config.data_dir / "sessions" / sid / "frames"
            folder.mkdir(parents=True, exist_ok=True)
            (folder / f"{packet['frame_index']}.jpg").write_bytes(jpeg)
            self.recorded_bytes[sid] = self.recorded_bytes.get(sid, 0) + len(jpeg)
            image_saved = True
        clean["has_image"] = image_saved
        self.pending.append((clean, image_saved))
        if len(self.pending) >= 20 or time.monotonic() - self.last_flush >= 1:
            self.flush()
        return image_saved

    def flush(self):
        if not self.pending:
            return
        batch = self.pending
        with DB.begin() as db:
            for packet, has_image in batch:
                sid = packet["session_id"]
                db.add(
                    FrameRow(
                        session_id=sid,
                        frame_index=packet["frame_index"],
                        timestamp=packet["timestamp"],
                        packet=packet,
                        has_image=has_image,
                    )
                )
                for obj in packet["objects"]:
                    if obj["status"] != "tracking":
                        continue
                    key = (sid, obj["id"])
                    row = db.get(TrackRow, key)
                    if row is None:
                        row = TrackRow(
                            session_id=sid,
                            track_id=obj["id"],
                            class_name="drone",
                            first_seen=obj["timestamp"],
                            last_seen=obj["timestamp"],
                        )
                        db.add(row)
                        db.add(
                            EventRow(
                                session_id=sid,
                                timestamp=packet["timestamp"],
                                level="INFO",
                                message=f"Track #{obj['id']} first recorded",
                            )
                        )
                    else:
                        row.last_seen = obj["timestamp"]
                    db.add(
                        PointRow(
                            session_id=sid,
                            track_id=obj["id"],
                            timestamp=obj["timestamp"],
                            data=obj,
                        )
                    )
                if packet["telemetry"]:
                    db.add(
                        TelemetryRow(
                            session_id=sid,
                            timestamp=packet["timestamp"],
                            data=packet["telemetry"],
                        )
                    )
                row = db.get(SessionRow, sid)
                row.frame_count = packet["frame_index"] + 1
                row.statistics = packet["statistics"]
        self.pending = []
        self.last_flush = time.monotonic()

    def finish(self, sid):
        self.flush()
        if sid:
            with DB.begin() as db:
                row = db.get(SessionRow, sid)
                if row:
                    row.ended_at = time.time()

    def save(self, sid, name):
        self.flush()
        with DB.begin() as db:
            row = db.get(SessionRow, sid)
            if not row:
                raise ValueError("Start a session first")
            row.saved = True
            row.name = name
        return self.get(sid)

    def event(self, sid, item):
        with DB.begin() as db:
            if db.get(SessionRow, sid) is None:
                return
            db.add(
                EventRow(
                    session_id=sid,
                    timestamp=item["timestamp"],
                    level=item["level"],
                    message=item["category"] + ": " + item["message"],
                )
            )

    def settings(self):
        with DB() as db:
            row = db.get(SettingRow, "application")
            return row.value if row else None

    def save_settings(self, value):
        with DB.begin() as db:
            db.merge(SettingRow(key="application", value=value))

    @staticmethod
    def serialize(row):
        return dict(
            id=row.id,
            name=row.name,
            started_at=row.started_at,
            ended_at=row.ended_at,
            source=row.source,
            model=row.model,
            algorithm=row.algorithm,
            saved=row.saved,
            frame_count=row.frame_count,
            metadata=row.meta,
            statistics=row.statistics,
        )

    def list(self):
        with DB() as db:
            return [
                self.serialize(r)
                for r in db.scalars(
                    select(SessionRow).order_by(SessionRow.started_at.desc()).limit(200)
                )
            ]

    def get(self, sid):
        with DB() as db:
            row = db.get(SessionRow, sid)
            if not row:
                raise ValueError("Session not found")
            return self.serialize(row)

    def frames(self, sid, offset=0, limit=300):
        session = self.get(sid)
        with DB() as db:
            rows = list(
                db.scalars(
                    select(FrameRow)
                    .where(FrameRow.session_id == sid)
                    .order_by(FrameRow.frame_index)
                    .offset(offset)
                    .limit(limit)
                )
            )
            return dict(
                session=session,
                frames=[r.packet for r in rows],
                next_offset=offset + len(rows)
                if offset + len(rows) < session["frame_count"]
                else None,
            )

    def image(self, sid, index):
        self.get(sid)
        path = config.data_dir / "sessions" / sid / "frames" / f"{index}.jpg"
        if not path.is_file():
            raise ValueError(
                "No video frame was recorded at this point; replay analytics remain available"
            )
        return path

    def delete(self, sid):
        self.get(sid)
        with DB.begin() as db:
            for table in (FrameRow, TrackRow, PointRow, TelemetryRow, EventRow):
                db.execute(delete(table).where(table.session_id == sid))
            db.execute(delete(SessionRow).where(SessionRow.id == sid))
        shutil.rmtree(config.data_dir / "sessions" / sid, ignore_errors=True)

    def iter_export(self, sid, format):
        session = self.get(sid)
        with DB() as db:
            if format == "json":
                yield (
                    '{"schema_version":1,"session":'
                    + json.dumps(session)
                    + ',"frames":['
                )
                first = True
                for row in db.scalars(
                    select(FrameRow)
                    .where(FrameRow.session_id == sid)
                    .order_by(FrameRow.frame_index)
                    .execution_options(yield_per=200)
                ):
                    yield ("" if first else ",") + json.dumps(
                        row.packet, allow_nan=False
                    )
                    first = False
                yield "]}"
            else:
                fields = [
                    "timestamp",
                    "track_id",
                    "class",
                    "confidence",
                    "x",
                    "y",
                    "width",
                    "height",
                    "velocity_x",
                    "velocity_y",
                    "speed",
                    "direction",
                    "source",
                    "units",
                ]
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerow(fields)
                yield output.getvalue()
                for row in db.scalars(
                    select(PointRow)
                    .where(PointRow.session_id == sid)
                    .order_by(PointRow.id)
                    .execution_options(yield_per=500)
                ):
                    o = row.data
                    b = o["bbox"]
                    v = o["velocity"]
                    output.seek(0)
                    output.truncate(0)
                    writer.writerow(
                        [
                            row.timestamp,
                            o["id"],
                            o["class_name"],
                            o["confidence"],
                            o["center"][0],
                            o["center"][1],
                            b[2] - b[0],
                            b[3] - b[1],
                            v["x"],
                            v["y"],
                            v["speed"],
                            o["direction"],
                            o["source"],
                            "px; px/s; degrees",
                        ]
                    )
                    yield output.getvalue()
