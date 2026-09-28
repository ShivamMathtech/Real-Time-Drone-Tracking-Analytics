import { useEffect, useRef } from "react";
import {
  Video,
  Play,
  Pause,
  Camera,
  Download,
  Radio,
  ScanLine,
} from "lucide-react";
import { Panel, Badge } from "./ui/Panel";
import { Button } from "./ui/button";
import { useApp, runAction } from "../stores/useApp";
import { post, saveBlob } from "../services/api";
import { number, timecode } from "../utils/format";
import { drawOverlay } from "./DetectionOverlay";
import type { ViewMode } from "../types";
function pixels(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode: ViewMode,
  previous: Uint8ClampedArray | null,
) {
  const image = ctx.getImageData(0, 0, w, h),
    data = image.data;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < gray.length; i++)
    gray[i] =
      0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2];
  for (let i = 0; i < gray.length; i++) {
    const j = 4 * i;
    const g = gray[i];
    let v = g;
    if (mode === "edge") {
      const x = i % w,
        y = Math.floor(i / w);
      v =
        x > 0 && x < w - 1 && y > 0 && y < h - 1
          ? Math.min(
              255,
              Math.hypot(gray[i + 1] - gray[i - 1], gray[i + w] - gray[i - w]) *
                2,
            )
          : 0;
    }
    if (mode === "motion")
      v = previous ? Math.min(255, Math.abs(g - previous[i]) * 5) : 0;
    if (mode === "thermal") {
      data[j] = Math.min(255, g * 2.5);
      data[j + 1] = Math.max(0, Math.min(255, (g - 65) * 2.5));
      data[j + 2] = Math.max(0, 150 - g * 1.2);
    } else data[j] = data[j + 1] = data[j + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return gray;
}
export function CameraViewer() {
  const packet = useApp((s) => s.packet),
    selected = useApp((s) => s.selected),
    view = useApp((s) => s.view),
    overlays = useApp((s) => s.overlays),
    replay = useApp((s) => s.replay),
    replayImage = useApp((s) => s.replayImage);
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef<Uint8ClampedArray | null>(null);
  const latest = useRef(packet);
  latest.current = packet;
  useEffect(() => {
    previous.current = null;
  }, [view, packet?.session_id]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !packet) return;
    const ctx = el.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let cancelled = false;
    const paint = (image?: HTMLImageElement) => {
      if (cancelled) return;
      el.width = packet.width;
      el.height = packet.height;
      ctx.fillStyle = "#041320";
      ctx.fillRect(0, 0, el.width, el.height);
      if (image) ctx.drawImage(image, 0, 0, el.width, el.height);
      else {
        ctx.fillStyle = "#638098";
        ctx.font = "17px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(
          replay
            ? "ANALYTICS REPLAY · no recorded image"
            : "WAITING FOR VIDEO FRAMES",
          el.width / 2,
          el.height / 2,
        );
        ctx.textAlign = "start";
      }
      if (["gray", "thermal", "edge", "motion"].includes(view))
        previous.current = pixels(
          ctx,
          el.width,
          el.height,
          view,
          previous.current,
        );
      if (view === "mask") {
        ctx.fillStyle = "#04090d";
        ctx.fillRect(0, 0, el.width, el.height);
        if (!packet.objects.some((t) => t.mask?.length)) {
          ctx.fillStyle = "#90a8bd";
          ctx.font = "15px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(
            "Segmentation unavailable — load a segmentation model",
            el.width / 2,
            el.height / 2,
          );
          ctx.textAlign = "start";
        }
      }
      drawOverlay(ctx, packet, selected, view, overlays);
    };
    const src = replay
      ? replayImage
      : packet.frame
        ? "data:image/jpeg;base64," + packet.frame
        : null;
    if (src) {
      const image = new Image();
      image.onload = () => paint(image);
      image.onerror = () => paint();
      image.src = src;
    } else paint();
    return () => {
      cancelled = true;
    };
  }, [packet, selected, view, overlays, replay, replayImage]);
  const snapshot = () => {
    if (!packet || !canvas.current) {
      useApp.getState().fail("Start a source before taking a snapshot.");
      return;
    }
    canvas.current.toBlob((blob) => {
      if (blob) {
        saveBlob(
          blob,
          `MathTech-${packet.session_id?.slice(0, 8)}-${packet.frame_index}.png`,
        );
        useApp
          .getState()
          .notify("PNG snapshot exported with overlays and session timestamp.");
      }
    }, "image/png");
  };
  const playing = packet?.status === "running";
  return (
    <Panel
      title="Live camera feed"
      icon={<Video size={16} />}
      action={
        <div className="camera-badges">
          <Badge
            tone={
              replay
                ? "amber"
                : packet?.source === "demo"
                  ? "amber"
                  : playing
                    ? "green"
                    : "muted"
            }
          >
            {replay
              ? "REPLAY"
              : packet?.source === "demo"
                ? "DEMO MODE"
                : playing
                  ? "● LIVE"
                  : (packet?.status || "STANDBY").toUpperCase()}
          </Badge>
          <span>
            {packet ? `${packet.width} × ${packet.height}` : "NO SOURCE"}
          </span>
        </div>
      }
      className="camera-panel"
    >
      <div className="camera-stage">
        <canvas
          ref={canvas}
          width="960"
          height="540"
          aria-label="Drone video with tracking overlays"
        />
        {!packet?.session_id && (
          <div className="camera-empty">
            <div className="reticle">
              <ScanLine size={44} />
            </div>
            <h2>Your observation window.</h2>
            <p>
              Connect a camera, open a video, or launch the deterministic demo.
            </p>
            <Button
              variant="default"
              onClick={() =>
                void runAction(() =>
                  post("/api/source/start", { kind: "demo" }),
                )
              }
            >
              <Play size={14} />
              Launch demo
            </Button>
            <span>CIVILIAN RESEARCH · UAV DETECTION ONLY</span>
          </div>
        )}
        <div className="camera-metrics">
          <span>
            <Radio size={11} />
            {number(packet?.fps)} FPS
          </span>
          <span>
            {number(packet?.latency_ms)} ms{" "}
            <small>
              {packet?.data_source === "simulation"
                ? "SIM GENERATION"
                : "INFERENCE"}
            </small>
          </span>
          <span>{packet?.device || "CPU"}</span>
        </div>
      </div>
      <div className="video-toolbar">
        <Button
          size="icon"
          variant="ghost"
          aria-label={playing ? "Pause video" : "Play video"}
          disabled={!packet?.session_id || !!replay}
          onClick={() =>
            void runAction(() =>
              post("/api/source/playback", {
                action: playing ? "pause" : "play",
              }),
            )
          }
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </Button>
        <span className="mono timecode">
          {timecode(packet?.video_time)}
          <small>
            {" "}
            / {packet?.duration ? timecode(packet.duration) : "LIVE"}
          </small>
        </span>
        <input
          aria-label="Video timeline"
          type="range"
          min="0"
          max={packet?.duration || 100}
          step=".1"
          value={
            packet?.duration ? Math.min(packet.video_time, packet.duration) : 0
          }
          disabled={packet?.source !== "file" || !!replay}
          onChange={(e) =>
            void runAction(() =>
              post("/api/source/playback", {
                action: "seek",
                value: Number(e.target.value),
              }),
            )
          }
        />
        <select
          aria-label="Playback speed"
          value={packet?.playback_speed || 1}
          disabled={
            !packet || !["demo", "file"].includes(packet.source) || !!replay
          }
          onChange={(e) =>
            void runAction(() =>
              post("/api/source/playback", {
                action: "speed",
                value: Number(e.target.value),
              }),
            )
          }
        >
          {[0.25, 0.5, 1, 2, 4].map((x) => (
            <option key={x} value={x}>
              {x}×
            </option>
          ))}
        </select>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Save PNG snapshot"
          title="Save PNG snapshot"
          disabled={!packet?.frame && !replay}
          onClick={snapshot}
        >
          <Camera size={17} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Export frame"
          title="Export frame with overlays"
          disabled={!packet?.frame && !replay}
          onClick={snapshot}
        >
          <Download size={16} />
        </Button>
      </div>
    </Panel>
  );
}
