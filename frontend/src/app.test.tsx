import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DetectedObjects } from "./components/DetectedObjects";
import { TrackingControls } from "./components/TrackingControls";
import { SessionControls } from "./components/SessionControls";
import { useApp, defaults, pointOf } from "./stores/useApp";
import type { Packet, Track } from "./types";
vi.mock("./services/api", () => ({
  post: vi.fn().mockResolvedValue({}),
  api: vi.fn().mockResolvedValue([]),
  download: vi.fn(),
  getKey: () => "",
  frameImage: vi.fn(),
}));
import { post, api } from "./services/api";
const track = {
  id: 1,
  center: [100, 80],
  bbox: [80, 60, 120, 100],
  velocity: { speed: 14, x: 14, y: 0, unit: "px/s", source: "simulation" },
  confidence: 0.93,
  direction: 0,
  duration: 2,
  status: "tracking",
  source: "simulation",
  history: [],
  path_length: 28,
  avg_speed: 14,
  max_speed: 14,
} as unknown as Track;
const packet = {
  seq: 1,
  frame_index: 1,
  session_id: "test-session",
  video_time: 1,
  objects: [track, { ...track, id: 2 }],
  source: "demo",
  data_source: "simulation",
  status: "running",
  tracking: true,
  telemetry: {},
  fps: 20,
  latency_ms: 2,
  statistics: {},
  recording: false,
} as unknown as Packet;
beforeEach(() => {
  vi.clearAllMocks();
  useApp.setState({
    packet,
    settings: defaults,
    selected: 1,
    history: [],
    logs: [],
    replay: null,
    error: null,
    busy: false,
  });
});
test("selecting a drone updates state and the backend association", () => {
  render(<DetectedObjects />);
  fireEvent.click(screen.getByRole("button", { name: /Drone #2/ }));
  expect(useApp.getState().selected).toBe(2);
  expect(post).toHaveBeenCalledWith("/api/tracking/select", { track_id: 2 });
});
test("empty detection list gives an honest empty state", () => {
  useApp.setState({ packet: { ...packet, objects: [] } });
  render(<DetectedObjects />);
  expect(screen.getByText("No drone tracks")).toBeInTheDocument();
});
test("controls render and stop performs a real operation", async () => {
  render(
    <MemoryRouter>
      <TrackingControls />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop tracking" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/tracking/stop"));
});
test("position chart samples track output and omits absent altitude", () => {
  const point = pointOf(packet, 1);
  expect(point.x).toBe(100);
  expect(point.altitude).toBeUndefined();
  useApp.getState().ingest({ ...packet, video_time: 2 });
  expect(useApp.getState().history.at(-1)?.speed).toBe(14);
});
test("model setting updates use the settings API", async () => {
  vi.mocked(api).mockResolvedValue({ ...defaults, mode: "single" });
  render(
    <MemoryRouter>
      <TrackingControls />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Single target" }));
  await waitFor(() => expect(useApp.getState().settings.mode).toBe("single"));
});
test("save session opens an editable dialog and posts its name", async () => {
  render(<SessionControls />);
  fireEvent.click(screen.getByRole("button", { name: "Save session" }));
  fireEvent.change(screen.getByLabelText("Session name"), {
    target: { value: "Test flight" },
  });
  const buttons = screen.getAllByRole("button", { name: "Save session" });
  fireEvent.click(buttons.at(-1)!);
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/session/save", {
      name: "Test flight",
    }),
  );
});
