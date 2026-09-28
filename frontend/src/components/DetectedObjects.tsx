import { Drone } from "./ui/Drone";
import { ScanLine } from "lucide-react";
import { Panel, Badge } from "./ui/Panel";
import { useApp } from "../stores/useApp";
import { post } from "../services/api";
import type { Track } from "../types";
const noTracks: Track[] = [];
import { number, timecode, trackColor } from "../utils/format";
export function DetectedObjects() {
  const tracks = useApp((s) => s.packet?.objects || noTracks);
  const selected = useApp((s) => s.selected);
  return (
    <Panel
      title="Detected objects"
      icon={<ScanLine size={15} />}
      action={
        <Badge>{tracks.filter((t) => t.status === "tracking").length}</Badge>
      }
      className="objects-panel"
    >
      <div className="object-list">
        {!tracks.length ? (
          <div className="empty compact">
            <Drone size={29} />
            <strong>No drone tracks</strong>
            <span>
              Run the demo or analyze a video with drone-trained weights.
            </span>
          </div>
        ) : (
          tracks.map((t) => (
            <button
              className={"object-card " + (selected === t.id ? "selected" : "")}
              key={t.id}
              onClick={() => {
                useApp.getState().select(t.id);
                if (!useApp.getState().replay)
                  void post("/api/tracking/select", { track_id: t.id }).catch(
                    useApp.getState().fail,
                  );
              }}
              aria-pressed={selected === t.id}
            >
              <div className="object-title">
                <span
                  className="drone-icon"
                  style={{ color: trackColor(t.id) }}
                >
                  <Drone size={24} />
                </span>
                <b>Drone #{t.id}</b>
                <i className={"dot " + (t.status === "lost" ? "amber" : "")} />
              </div>
              <div className="object-meta">
                <span>
                  Confidence<b>{number(t.confidence * 100, 1)}%</b>
                </span>
                <span>
                  Position
                  <b>
                    {number(t.center[0], 0)}, {number(t.center[1], 0)} px
                  </b>
                </span>
                <span>
                  Image velocity<b>{number(t.velocity.speed)} px/s</b>
                </span>
                <span>
                  Direction / duration
                  <b>
                    {number(t.direction, 0)}° · {timecode(t.duration)}
                  </b>
                </span>
              </div>
              <small>
                {t.source === "simulation"
                  ? "SIMULATED TRACK"
                  : "VISION ESTIMATE"}{" "}
                · {t.status.toUpperCase()}
              </small>
            </button>
          ))
        )}
      </div>
    </Panel>
  );
}
