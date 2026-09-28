import { useState } from "react";
import {
  Save,
  Download,
  FolderOpen,
  Disc,
  Play,
  Pause,
  Trash2,
  X,
} from "lucide-react";
import { Panel, Badge } from "./ui/Panel";
import { Button } from "./ui/button";
import { Modal } from "./ui/Modal";
import { useApp, runAction } from "../stores/useApp";
import { api, post, download } from "../services/api";
import { replayController } from "../services/replay";
import { timecode } from "../utils/format";
import type { SessionInfo } from "../types";
export function ExportPanel({ sessionId }: { sessionId: string | null }) {
  return (
    <div className="export-actions">
      {(["csv", "json", "report"] as const).map((format) => (
        <Button
          key={format}
          size="sm"
          disabled={!sessionId}
          onClick={() =>
            void runAction(() =>
              download(
                `/api/export/${sessionId}?format=${format}`,
                `MathTech-${sessionId}.${format === "report" ? "html" : format}`,
              ),
            )
          }
        >
          <Download size={13} />
          {format === "report" ? "Session report" : format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
export function SessionControls() {
  const p = useApp((s) => s.packet),
    replay = useApp((s) => s.replay),
    busy = useApp((s) => s.busy);
  const [saving, setSaving] = useState(false),
    [name, setName] = useState("Research session"),
    [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const refresh = async () =>
    setSessions(await api<SessionInfo[]>("/api/sessions"));
  return (
    <>
      <Panel
        title="Session workspace"
        icon={<FolderOpen size={15} />}
        action={
          <span className="eyebrow">
            {p?.session_id?.slice(0, 8) || "NO ACTIVE SESSION"}
          </span>
        }
      >
        <div className="session-toolbar">
          <Button
            size="sm"
            disabled={!p?.session_id || !!replay || busy}
            variant={p?.recording ? "danger" : "secondary"}
            onClick={() =>
              void runAction(() =>
                post("/api/session/record", { enabled: !p?.recording }),
              )
            }
          >
            <Disc size={14} />
            {p?.recording ? "Stop recording" : "Record frames"}
          </Button>
          <Button
            size="sm"
            disabled={!p?.session_id || !!replay || busy}
            onClick={() => setSaving(true)}
          >
            <Save size={14} />
            Save session
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void runAction(refresh)}
          >
            <FolderOpen size={14} />
            Saved sessions
          </Button>
          <ExportPanel sessionId={p?.session_id || null} />
        </div>
        <div className="panel-footnote">
          Analytics are autosaved. Enable frame recording for video-backed
          replay.
        </div>
      </Panel>
      {saving && (
        <Modal title="Save tracking session" onClose={() => setSaving(false)}>
          <label>
            Session name
            <input
              autoFocus
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button
            variant="default"
            disabled={!name.trim() || busy}
            onClick={() =>
              void runAction(async () => {
                await post("/api/session/save", { name });
                setSaving(false);
                useApp
                  .getState()
                  .notify(
                    "Session saved with tracking records and statistics.",
                  );
              })
            }
          >
            <Save size={16} />
            Save session
          </Button>
        </Modal>
      )}
      {sessions && (
        <Modal title="Session archive" onClose={() => setSessions(null)}>
          <p>
            Replay includes recorded analytics. Video frames appear only when
            recording was enabled.
          </p>
          <div className="session-list">
            {!sessions.length && (
              <p>No sessions yet. Run the demo to create your first session.</p>
            )}
            {sessions.map((s) => (
              <article className="session-row" key={s.id}>
                <div>
                  <h3>{s.name}</h3>
                  <small>
                    {new Date(s.started_at * 1000).toLocaleString()} ·{" "}
                    {s.source.toUpperCase()} · {s.frame_count} frames
                  </small>
                  <span>
                    {timecode(s.statistics.total_tracking_time)} ·{" "}
                    {s.statistics.unique_tracks || 0} tracks{" "}
                    {s.saved && "· SAVED"}
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={!s.frame_count || busy}
                  onClick={() =>
                    void runAction(async () => {
                      await replayController.load(s);
                      setSessions(null);
                    })
                  }
                >
                  <Play size={13} />
                  Replay
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${s.name}`}
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(`Delete “${s.name}” and all its recorded data?`)
                    )
                      void runAction(async () => {
                        await api(`/api/session/${s.id}`, { method: "DELETE" });
                        await refresh();
                      });
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
export function ReplayBar() {
  const replay = useApp((s) => s.replay),
    p = useApp((s) => s.packet);
  if (!replay) return null;
  return (
    <div className="replay-bar">
      <Badge tone="amber">SESSION REPLAY</Badge>
      <strong>{replay.name}</strong>
      <Button
        size="icon"
        aria-label="Play replay"
        onClick={() => replayController.play()}
      >
        <Play size={15} />
      </Button>
      <Button
        size="icon"
        aria-label="Pause replay"
        onClick={() => replayController.pause()}
      >
        <Pause size={15} />
      </Button>
      <input
        aria-label="Replay timeline"
        type="range"
        min={0}
        max={Math.max(0, replay.frame_count - 1)}
        value={p?.frame_index || 0}
        onChange={(e) =>
          void runAction(() => replayController.seek(Number(e.target.value)))
        }
      />
      <span>{timecode(p?.video_time)}</span>
      <select
        aria-label="Replay speed"
        onChange={(e) => replayController.setSpeed(Number(e.target.value))}
        defaultValue={1}
      >
        {[0.25, 0.5, 1, 2, 4].map((v) => (
          <option key={v} value={v}>
            {v}×
          </option>
        ))}
      </select>
      <Button size="sm" onClick={() => replayController.exit()}>
        <X size={13} />
        Exit replay
      </Button>
    </div>
  );
}
