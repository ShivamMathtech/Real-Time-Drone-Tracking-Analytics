import { create } from "zustand";
import type {
  Packet,
  Settings,
  ModelInfo,
  LogEntry,
  ChartPoint,
  ViewMode,
  Overlays,
  SessionInfo,
} from "../types";
export const defaults: Settings = {
  confidence: 0.6,
  iou: 0.45,
  algorithm: "bytetrack",
  mode: "multi",
  auto_tracking: true,
  kalman: true,
  trail_length: 100,
  lost_timeout: 2,
  max_objects: 20,
  fps_limit: 20,
  processing_width: 960,
  frame_skip: 0,
  telemetry_source: "none",
  telemetry_refresh_hz: 10,
  theme: "dark",
  units: "px",
  language: "en",
  worker_count: 1,
  device: "auto",
};
export function pointOf(p: Packet, id: number | null): ChartPoint {
  const track = p.objects.find((x) => x.id === id) || p.objects[0];
  const altitude = track ? p.telemetry[String(track.id)]?.altitude : undefined;
  return {
    t: p.video_time,
    count: p.objects.filter((x) => x.status === "tracking").length,
    confidence: track?.confidence || 0,
    fps: p.fps,
    latency: p.latency_ms,
    x: track?.center[0],
    y: track?.center[1],
    speed: track?.velocity.speed,
    altitude: altitude?.value,
    altitudeSource: altitude?.source,
    latitude: track
      ? p.telemetry[String(track.id)]?.latitude?.value
      : undefined,
    longitude: track
      ? p.telemetry[String(track.id)]?.longitude?.value
      : undefined,
  };
}
type AppState = {
  packet: Packet | null;
  settings: Settings;
  models: ModelInfo | null;
  connection: "connecting" | "online" | "offline";
  selected: number | null;
  history: ChartPoint[];
  logs: LogEntry[];
  error: string | null;
  notice: string | null;
  busy: boolean;
  view: ViewMode;
  overlays: Overlays;
  windowSeconds: number;
  replay: SessionInfo | null;
  replayImage: string | null;
  apiRevision: number;
  ingest: (p: Packet) => void;
  select: (id: number | null) => void;
  setSettings: (s: Settings) => void;
  fail: (e: unknown) => void;
  notify: (s: string) => void;
  set: (partial: Partial<AppState>) => void;
};
export const useApp = create<AppState>((set, get) => ({
  packet: null,
  settings: defaults,
  models: null,
  connection: "connecting",
  selected: null,
  history: [],
  logs: [],
  error: null,
  notice: null,
  busy: false,
  view: "bounding",
  overlays: {
    boxes: true,
    ids: true,
    confidence: true,
    centers: true,
    vectors: true,
    trail: true,
    coordinates: true,
    grid: false,
  },
  windowSeconds: 30,
  replay: null,
  replayImage: null,
  apiRevision: 0,
  ingest(p) {
    const s = get();
    const changed = p.session_id !== s.packet?.session_id;
    const selected = changed ? null : s.selected;
    const id = selected ?? p.objects[0]?.id ?? null;
    const history = changed ? [] : s.history;
    const sample =
      !history.length || p.video_time - history[history.length - 1].t >= 0.19;
    set({
      packet: p,
      selected: id,
      history: sample ? [...history, pointOf(p, id)].slice(-1600) : history,
      logs: [...s.logs, ...(p.logs || [])].slice(-1000),
      error: p.error || s.error,
    });
  },
  select(id) {
    set({ selected: id, history: [] });
  },
  setSettings(settings) {
    set({ settings });
  },
  fail(e) {
    set({ error: e instanceof Error ? e.message : String(e), busy: false });
  },
  notify(notice) {
    set({ notice });
    setTimeout(() => set({ notice: null }), 5000);
  },
  set(partial) {
    set(partial);
  },
}));
export async function runAction(action: () => Promise<unknown>) {
  useApp.getState().set({ busy: true, error: null });
  try {
    await action();
  } catch (e) {
    useApp.getState().fail(e);
  } finally {
    useApp.getState().set({ busy: false });
  }
}
