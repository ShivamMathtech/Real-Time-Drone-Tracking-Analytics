import {
  Image,
  Scan,
  Route,
  Layers,
  Flame,
  Contrast,
  Focus,
  Move,
  SlidersHorizontal,
} from "lucide-react";
import { Panel } from "./ui/Panel";
import { useApp, runAction } from "../stores/useApp";
import { api } from "../services/api";
import type { ViewMode, Settings, Overlays } from "../types";
const modes: [ViewMode, string, typeof Image][] = [
  ["original", "Original", Image],
  ["bounding", "Bounding box", Scan],
  ["trail", "Tracking trail", Route],
  ["mask", "Segmentation", Layers],
  ["thermal", "Thermal simulation", Flame],
  ["gray", "Grayscale", Contrast],
  ["edge", "Edge view", Focus],
  ["motion", "Motion view", Move],
];
export function ViewModeSelector() {
  const view = useApp((s) => s.view),
    overlays = useApp((s) => s.overlays),
    settings = useApp((s) => s.settings),
    p = useApp((s) => s.packet);
  const segmentation = useApp((s) => s.models?.segmentation);
  const hasMask = p?.source === "demo" || segmentation;
  return (
    <>
      <Panel
        title="Multiple views"
        icon={<Layers size={15} />}
        action={<span className="eyebrow">VISUAL PROCESSING</span>}
      >
        <div className="view-modes">
          {modes.map(([key, label, Icon]) => (
            <button
              key={key}
              aria-pressed={view === key}
              disabled={key === "mask" && !hasMask}
              title={
                key === "mask" && !hasMask
                  ? "Requires segmentation weights or demo mode"
                  : label
              }
              className={view === key ? "active" : ""}
              onClick={() => useApp.getState().set({ view: key })}
            >
              <div className={"view-thumbnail " + key}>
                <Icon size={25} />
                {view === key && <i />}
              </div>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel
        title="Overlay & tracking options"
        icon={<SlidersHorizontal size={15} />}
      >
        <div className="overlay-options">
          {Object.entries(overlays).map(([key, value]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={value}
                onChange={(e) =>
                  useApp
                    .getState()
                    .set({
                      overlays: {
                        ...overlays,
                        [key]: e.target.checked,
                      } as Overlays,
                    })
                }
              />
              {
                (
                  {
                    boxes: "Bounding box",
                    ids: "Track ID",
                    confidence: "Confidence",
                    centers: "Center point",
                    vectors: "Motion vector",
                    trail: "Trajectory",
                    coordinates: "Coordinates",
                    grid: "Grid",
                  } as Record<string, string>
                )[key]
              }
            </label>
          ))}
          <label className="trail-select">
            Trail length
            <select
              aria-label="Trail length"
              value={settings.trail_length}
              onChange={(e) =>
                void runAction(async () =>
                  useApp
                    .getState()
                    .setSettings(
                      await api<Settings>("/api/settings", {
                        method: "PUT",
                        body: JSON.stringify({
                          ...settings,
                          trail_length: Number(e.target.value),
                        }),
                      }),
                    ),
                )
              }
            >
              <option value={0}>Off</option>
              <option value={30}>Short · 30</option>
              <option value={100}>Medium · 100</option>
              <option value={300}>Long · 300</option>
              {![0, 30, 100, 300].includes(settings.trail_length) && (
                <option value={settings.trail_length}>
                  {settings.trail_length}
                </option>
              )}
            </select>
          </label>
        </div>
      </Panel>
    </>
  );
}
