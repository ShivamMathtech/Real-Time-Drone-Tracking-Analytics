import json
from sqlalchemy import (
    create_engine,
    String,
    Float,
    Integer,
    Boolean,
    JSON,
    ForeignKey,
    Text,
    Index,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from app.config import config


class Base(DeclarativeBase):
    pass


class SessionRow(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    started_at: Mapped[float] = mapped_column(Float)
    ended_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(180))
    algorithm: Mapped[str] = mapped_column(String(40))
    saved: Mapped[bool] = mapped_column(Boolean, default=False)
    frame_count: Mapped[int] = mapped_column(Integer, default=0)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    statistics: Mapped[dict] = mapped_column(JSON, default=dict)


class FrameRow(Base):
    __tablename__ = "frames"
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    frame_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[float] = mapped_column(Float)
    packet: Mapped[dict] = mapped_column(JSON)
    has_image: Mapped[bool] = mapped_column(Boolean, default=False)


class TrackRow(Base):
    __tablename__ = "tracks"
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    track_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    class_name: Mapped[str] = mapped_column(String(30))
    first_seen: Mapped[float] = mapped_column(Float)
    last_seen: Mapped[float] = mapped_column(Float)


class PointRow(Base):
    __tablename__ = "track_points"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    track_id: Mapped[int] = mapped_column(Integer, index=True)
    timestamp: Mapped[float] = mapped_column(Float)
    data: Mapped[dict] = mapped_column(JSON)


class TelemetryRow(Base):
    __tablename__ = "telemetry"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    timestamp: Mapped[float] = mapped_column(Float)
    data: Mapped[dict] = mapped_column(JSON)


class EventRow(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    timestamp: Mapped[float] = mapped_column(Float)
    level: Mapped[str] = mapped_column(String(12))
    message: Mapped[str] = mapped_column(Text)


class SettingRow(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


engine = create_engine(
    config.database_url,
    connect_args={"check_same_thread": False, "timeout": 30}
    if config.database_url.startswith("sqlite")
    else {},
    pool_pre_ping=True,
)
DB = sessionmaker(engine, expire_on_commit=False)


def initialize():
    if config.database_url.startswith("sqlite"):
        from sqlalchemy import event

        @event.listens_for(engine, "connect")
        def pragmas(connection, record):
            cursor = connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    Base.metadata.create_all(engine)
