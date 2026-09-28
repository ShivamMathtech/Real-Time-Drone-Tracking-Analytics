import { useState, useEffect, useRef } from "react";
import {
  Save,
  Upload,
  Cpu,
  Eye,
  Video,
  Route,
  Radio,
  Settings2,
  Shield,
  RefreshCw,
} from "lucide-react";
import { Panel, Badge } from "../components/ui/Panel";
import { Button } from "../components/ui/button";
import { useApp, runAction } from "../stores/useApp";
import { api, post, getKey } from "../services/api";
import type { Settings, ModelInfo } from "../types";
export function ModelSelector() {
  const models = useApp((s) => s.models),
    busy = useApp((s) => s.busy);
  const [selected, setSelected] = useState(models?.loaded || "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (models?.loaded) setSelected(models.loaded);
  }, [models?.loaded]);
  return (
    <Panel
      title="Model management"
      icon={<Eye size={16} />}
      action={<Badge>{models?.device || "CPU"}</Badge>}
    >
      <div className="panel-body">
        <p>
          Install a custom drone/UAV detector. The class allowlist excludes
          people and unrelated object categories.
        </p>
        <label>
          Available YOLO weights
          <select
            aria-label="Model file"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select installed model…</option>
            {models?.files.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <div className="button-row">
          <Button
            disabled={!selected || busy}
            variant="default"
            onClick={() =>
              void runAction(async () => {
                const data = await post<ModelInfo>("/api/models/load", {
                  filename: selected,
                });
                useApp.getState().set({ models: data });
                useApp.getState().notify("Drone model validated and loaded.");
              })
            }
          >
            Load model
          </Button>
          <Button disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={14} />
            Upload model
          </Button>
          <Button
            size="icon"
            aria-label="Refresh model list"
            onClick={() =>
              void runAction(async () =>
                useApp.getState().set({ models: await api("/api/models") }),
              )
            }
          >
            <RefreshCw size={15} />
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept={models?.pt_upload_enabled ? ".pt,.onnx" : ".onnx"}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file)
              void runAction(async () => {
                const form = new FormData();
                form.append("file", file);
                const data = await api<ModelInfo>("/api/models/upload", {
                  method: "POST",
                  body: form,
                });
                useApp.getState().set({ models: data });
                setSelected(
                  data.files.find((f) => !models?.files.includes(f)) || "",
                );
                useApp
                  .getState()
                  .notify("Model uploaded. Select Load model to validate it.");
              });
          }}
        />
        <div className="hint">
          <Shield size={15} />
          <span>
            Trusted .pt weights belong in backend/models. Browser .pt upload is{" "}
            {models?.pt_upload_enabled ? "enabled by the operator" : "disabled"}{" "}
            because PyTorch checkpoints can execute code. ONNX uploads are
            validated.
          </span>
        </div>
        <dl className="detail-list">
          <dt>Loaded classes</dt>
          <dd>{models?.classes.join(", ") || "None"}</dd>
          <dt>Segmentation</dt>
          <dd>
            {models?.segmentation
              ? "Available"
              : "Requires segmentation weights"}
          </dd>
        </dl>
      </div>
    </Panel>
  );
}
export function SettingsPanel() {
  const current = useApp((s) => s.settings),
    models = useApp((s) => s.models),
    busy = useApp((s) => s.busy);
  const [draft, setDraft] = useState<Settings>(current),
    [key, setKey] = useState(getKey());
  useEffect(() => setDraft(current), [current]);
  const set = <K extends keyof Settings>(name: K, value: Settings[K]) =>
    setDraft({ ...draft, [name]: value });
  const numeric = (
    label: string,
    name: keyof Settings,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label key={name}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft[name] as number}
        onChange={(e) => setDraft({ ...draft, [name]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <>
      <div className="settings-grid">
        <Panel title="General" icon={<Settings2 size={16} />}>
          <div className="panel-body field-grid">
            <label>
              Theme
              <select
                value={draft.theme}
                onChange={(e) =>
                  set("theme", e.target.value as Settings["theme"])
                }
              >
                <option value="dark">Dark · Control room</option>
                <option value="light">Light · Research desk</option>
              </select>
            </label>
            <label>
              Units
              <select value="px" disabled>
                <option value="px">Image px / px per second</option>
              </select>
            </label>
            <label>
              Language
              <select value="en" disabled>
                <option value="en">English</option>
              </select>
            </label>
            <p className="micro">
              Additional languages and physical-unit calibration are unavailable
              in this release.
            </p>
          </div>
        </Panel>
        <Panel title="Vision" icon={<Eye size={16} />}>
          <div className="panel-body field-grid">
            {numeric("Confidence threshold", "confidence", 0.05, 1, 0.01)}
            {numeric("NMS IoU threshold", "iou", 0.1, 0.95, 0.01)}
            <label>
              Tracking algorithm
              <select
                value={draft.algorithm}
                onChange={(e) =>
                  set("algorithm", e.target.value as Settings["algorithm"])
                }
              >
                <option value="bytetrack">ByteTrack</option>
                <option value="deepsort" disabled={!models?.deepsort_available}>
                  DeepSORT · HSV appearance
                </option>
              </select>
            </label>
            <label className="switch-row">
              <span>Kalman filter</span>
              <input
                type="checkbox"
                role="switch"
                checked={draft.kalman}
                onChange={(e) => set("kalman", e.target.checked)}
              />
            </label>
          </div>
        </Panel>
        <Panel title="Video & performance" icon={<Cpu size={16} />}>
          <div className="panel-body field-grid">
            {numeric("Processed FPS limit", "fps_limit", 1, 60)}
            {numeric(
              "Processing width (px)",
              "processing_width",
              320,
              1920,
              16,
            )}
            {numeric("Skipped source frames", "frame_skip", 0, 15)}
            <label>
              Compute device
              <select
                value={draft.device}
                onChange={(e) =>
                  set("device", e.target.value as Settings["device"])
                }
              >
                <option value="auto">Auto · CUDA → CPU</option>
                <option value="cpu">CPU</option>
                <option value="cuda">CUDA · CPU fallback</option>
              </select>
            </label>
            <label>
              Worker count
              <input value="1 — one ordered stream worker" disabled />
            </label>
            <p className="micro">
              Resolution preserves aspect ratio. Ordered inference prevents
              track corruption. Deploy separate instances for more streams.
            </p>
          </div>
        </Panel>
        <Panel title="Tracking" icon={<Route size={16} />}>
          <div className="panel-body field-grid">
            {numeric("Trail length (points)", "trail_length", 0, 500)}
            {numeric("Lost track timeout (s)", "lost_timeout", 0.2, 15, 0.1)}
            {numeric("Maximum active objects", "max_objects", 1, 100)}
            <label className="switch-row">
              <span>Auto tracking on source start</span>
              <input
                type="checkbox"
                role="switch"
                checked={draft.auto_tracking}
                onChange={(e) => set("auto_tracking", e.target.checked)}
              />
            </label>
          </div>
        </Panel>
        <Panel title="Telemetry" icon={<Radio size={16} />}>
          <div className="panel-body field-grid">
            <label>
              Telemetry source
              <select
                value={draft.telemetry_source}
                onChange={(e) =>
                  set(
                    "telemetry_source",
                    e.target.value as Settings["telemetry_source"],
                  )
                }
              >
                <option value="none">None · image-space only</option>
                <option value="simulation">
                  Simulation · demo source only
                </option>
                <option value="custom">
                  Custom API · explicit track association
                </option>
                <option disabled>MAVLink · unavailable</option>
              </select>
            </label>
            {numeric("Refresh rate (Hz)", "telemetry_refresh_hz", 1, 30)}
            <p className="micro">
              Custom sensor values require a recent timestamp and an active
              track ID. Stale telemetry expires. No altitude or GPS is inferred
              from a single camera.
            </p>
          </div>
        </Panel>
        <Panel title="Connection security" icon={<Shield size={16} />}>
          <div className="panel-body">
            <label>
              Backend API key
              <input
                type="password"
                value={key}
                autoComplete="off"
                onChange={(e) => setKey(e.target.value)}
                placeholder="Optional for local-only deployment"
              />
            </label>
            <Button
              onClick={() => {
                sessionStorage.setItem("mathtech-api-key", key);
                useApp
                  .getState()
                  .set({
                    apiRevision: useApp.getState().apiRevision + 1,
                    error: null,
                  });
                useApp
                  .getState()
                  .notify(
                    "Connection credentials updated for this browser tab.",
                  );
              }}
            >
              Apply connection key
            </Button>
            <p className="micro">
              Configure API_KEY on the backend before exposing this service
              beyond localhost. This is one shared operator workspace.
            </p>
          </div>
        </Panel>
      </div>
      <div className="settings-save">
        <p>
          Applying processing settings starts a fresh tracker segment. Saved
          session data is retained.
        </p>
        <Button
          variant="default"
          disabled={busy}
          onClick={() =>
            void runAction(async () => {
              const saved = await api<Settings>("/api/settings", {
                method: "PUT",
                body: JSON.stringify(draft),
              });
              useApp.getState().set({ settings: saved, history: [] });
              useApp.getState().notify("Settings saved and applied.");
            })
          }
        >
          <Save size={15} />
          Save & apply settings
        </Button>
      </div>
    </>
  );
}
export function SettingsPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE CONFIGURATION / 04</span>
          <h1>
            System <span>settings</span>
          </h1>
          <p>
            Model selection, pipeline performance, tracking behavior and
            telemetry sources.
          </p>
        </div>
      </div>
      <ModelSelector />
      <SettingsPanel />
    </>
  );
}
