import {
  Crosshair,
  Play,
  Pause,
  Square,
  RotateCcw,
  Eraser,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Panel, Badge } from "./ui/Panel";
import { Button } from "./ui/button";
import { useApp, runAction } from "../stores/useApp";
import { api, post } from "../services/api";
import type { Settings } from "../types";
export function TrackingControls() {
  const settings = useApp((s) => s.settings);
  const packet = useApp((s) => s.packet);
  const busy = useApp((s) => s.busy);
  const models = useApp((s) => s.models);
  const replay = useApp((s) => s.replay);
  const update = (changes: Partial<Settings>) =>
    runAction(async () => {
      const next = await api<Settings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ ...settings, ...changes }),
      });
      useApp.getState().setSettings(next);
      useApp.getState().set({ history: [] });
    });
  return (
    <Panel
      title="Tracking controls"
      icon={<Crosshair size={16} />}
      className="controls-panel"
    >
      <div className="panel-body">
        <label className="switch-row">
          <span>
            <Crosshair size={15} />
            Auto tracking
          </span>
          <input
            aria-label="Auto tracking"
            type="checkbox"
            role="switch"
            checked={settings.auto_tracking}
            disabled={busy || !!replay}
            onChange={(e) => void update({ auto_tracking: e.target.checked })}
          />
        </label>
        <p className="micro">Automatically analyze new video sources</p>
        <label>
          Target class
          <div className="static-field">
            <Crosshair size={15} />
            Drone (UAV)<Badge>ONLY</Badge>
          </div>
        </label>
        <label>
          Detection model
          <div className="static-field">
            <span>
              {packet?.source === "demo"
                ? "Simulation generator"
                : models?.loaded || "No model loaded"}
            </span>
            <Link to="/settings" aria-label="Configure model">
              <SlidersHorizontal size={14} />
            </Link>
          </div>
        </label>
        <fieldset className="field-control">
          <legend>Tracking mode</legend>
          <div className="segmented">
            <button
              disabled={busy || !!replay}
              className={settings.mode === "single" ? "active" : ""}
              onClick={() => void update({ mode: "single" })}
            >
              Single target
            </button>
            <button
              disabled={busy || !!replay}
              className={settings.mode === "multi" ? "active" : ""}
              onClick={() => void update({ mode: "multi" })}
            >
              Multi target
            </button>
          </div>
        </fieldset>
        <label>
          Detection confidence <output>{settings.confidence.toFixed(2)}</output>
          <input
            aria-label="Detection confidence"
            type="range"
            min="0.05"
            max="1"
            step="0.01"
            value={settings.confidence}
            disabled={!!replay}
            onChange={(e) =>
              useApp
                .getState()
                .setSettings({
                  ...settings,
                  confidence: Number(e.target.value),
                })
            }
            onPointerUp={(e) =>
              void update({ confidence: Number(e.currentTarget.value) })
            }
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") || ["Home", "End"].includes(e.key))
                void update({ confidence: Number(e.currentTarget.value) });
            }}
          />
        </label>
        <label>
          Tracking algorithm
          <select
            value={settings.algorithm}
            disabled={busy || !!replay}
            onChange={(e) =>
              void update({
                algorithm: e.target.value as Settings["algorithm"],
              })
            }
          >
            <option value="bytetrack">ByteTrack</option>
            <option value="deepsort" disabled={!models?.deepsort_available}>
              DeepSORT{" "}
              {models?.deepsort_available ? "" : "— optional dependency"}
            </option>
          </select>
        </label>
        <label className="switch-row compact">
          <span>Kalman smoothing</span>
          <input
            aria-label="Kalman smoothing"
            type="checkbox"
            role="switch"
            checked={settings.kalman}
            disabled={busy || !!replay}
            onChange={(e) => void update({ kalman: e.target.checked })}
          />
        </label>
        <div className="tracking-actions">
          <Button
            variant="default"
            disabled={
              busy ||
              !!replay ||
              !packet ||
              ["idle", "stopped", "ended"].includes(packet.status)
            }
            onClick={() => void runAction(() => post("/api/tracking/start"))}
          >
            <Play size={13} />
            Start tracking
          </Button>
          <Button
            disabled={
              busy ||
              !!replay ||
              !packet ||
              !["running", "paused"].includes(packet.status)
            }
            onClick={() =>
              void runAction(() =>
                post("/api/source/playback", {
                  action: packet?.status === "paused" ? "play" : "pause",
                }),
              )
            }
          >
            <Pause size={13} />
            {packet?.status === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="danger"
            disabled={busy || !!replay || !packet?.tracking}
            onClick={() => void runAction(() => post("/api/tracking/stop"))}
          >
            <Square size={13} />
            Stop tracking
          </Button>
        </div>
        <div className="two-actions">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !!replay}
            onClick={() => void runAction(() => post("/api/tracking/reset"))}
          >
            <RotateCcw size={12} />
            Reset tracks
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !!replay}
            onClick={() =>
              void runAction(async () => {
                await post("/api/tracking/history/clear");
                useApp.getState().set({ history: [] });
              })
            }
          >
            <Eraser size={12} />
            Clear trails
          </Button>
        </div>
      </div>
    </Panel>
  );
}
