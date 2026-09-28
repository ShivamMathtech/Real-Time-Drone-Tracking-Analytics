export type HistoryPoint = { x: number; y: number; timestamp: number };
export type Track = {
  id: number;
  class_name: string;
  confidence: number;
  bbox: number[];
  center: number[];
  timestamp: number;
  velocity: {
    x: number;
    y: number;
    speed: number;
    unit: string;
    source: string;
  };
  direction: number;
  angular_velocity: number;
  history: HistoryPoint[];
  status: "tracking" | "lost";
  duration: number;
  path_length: number;
  avg_speed: number;
  max_speed: number;
  source: string;
  predicted_center: number[] | null;
  mask: number[][] | null;
};
export type Metric = {
  value: number;
  unit: string;
  timestamp: number;
  source: "telemetry" | "simulation" | "vision";
};
export type Statistics = {
  total_detections: number;
  unique_tracks: number;
  average_confidence: number;
  average_fps: number;
  average_latency: number;
  longest_track: number;
  total_tracking_time: number;
  processed_frames: number;
  direction_distribution: Record<string, number>;
};
export type LogEntry = {
  id: number;
  timestamp: number;
  level: string;
  category: string;
  message: string;
};
export type Packet = {
  seq: number;
  timestamp: number;
  video_time: number;
  fps: number;
  latency_ms: number;
  processing_ms: number;
  frame_index: number;
  width: number;
  height: number;
  duration: number | null;
  source: string;
  source_label: string;
  data_source: string;
  status: string;
  tracking: boolean;
  recording: boolean;
  playback_speed: number;
  model: string;
  device: string;
  session_id: string | null;
  selected_track: number | null;
  objects: Track[];
  telemetry: Record<string, Record<string, Metric>>;
  statistics: Statistics;
  frame: string | null;
  error: string | null;
  logs?: LogEntry[];
  has_image?: boolean;
};
export type Settings = {
  confidence: number;
  iou: number;
  algorithm: "bytetrack" | "deepsort";
  mode: "single" | "multi";
  auto_tracking: boolean;
  kalman: boolean;
  trail_length: number;
  lost_timeout: number;
  max_objects: number;
  fps_limit: number;
  processing_width: number;
  frame_skip: number;
  telemetry_source: "none" | "simulation" | "custom";
  telemetry_refresh_hz: number;
  theme: "dark" | "light";
  units: "px";
  language: "en";
  worker_count: 1;
  device: "auto" | "cpu" | "cuda";
};
export type ModelInfo = {
  loaded: string | null;
  device: string;
  files: string[];
  classes: string[];
  segmentation: boolean;
  pt_upload_enabled: boolean;
  deepsort_available: boolean;
};
export type SessionInfo = {
  id: string;
  name: string;
  started_at: number;
  ended_at: number | null;
  source: string;
  model: string;
  algorithm: string;
  saved: boolean;
  frame_count: number;
  metadata: Record<string, unknown>;
  statistics: Statistics;
};
export type SessionDetail = {
  session: SessionInfo;
  frames: Packet[];
  next_offset: number | null;
};
export type ChartPoint = {
  t: number;
  count: number;
  confidence: number;
  fps: number;
  latency: number;
  x?: number;
  y?: number;
  speed?: number;
  altitude?: number;
  altitudeSource?: string;
  latitude?: number;
  longitude?: number;
};
export type ViewMode =
  | "original"
  | "bounding"
  | "trail"
  | "mask"
  | "thermal"
  | "gray"
  | "edge"
  | "motion";
export type Overlays = {
  boxes: boolean;
  ids: boolean;
  confidence: boolean;
  centers: boolean;
  vectors: boolean;
  trail: boolean;
  coordinates: boolean;
  grid: boolean;
};
