import { Drone } from "./ui/Drone";
import { LocateFixed } from "lucide-react";
import { Panel, Badge } from "./ui/Panel";
import { useApp } from "../stores/useApp";
import { number, timecode } from "../utils/format";
export function DroneDetails() {
  const p = useApp((s) => s.packet),
    id = useApp((s) => s.selected);
  const t = p?.objects.find((x) => x.id === id);
  const altitude = t ? p?.telemetry[String(t.id)]?.altitude : undefined;
  return (
    <Panel
      title="Drone tracking details"
      icon={<LocateFixed size={15} />}
      className="details-panel"
    >
      <div className="panel-body">
        <div className="selected-drone">
          <span className="drone-portrait">
            <Drone size={37} />
          </span>
          <div>
            <h3>{t ? `Drone #${t.id}` : "No track selected"}</h3>
            <span
              className={
                t?.status === "tracking" && p?.status === "running"
                  ? "green"
                  : "muted"
              }
            >
              {t && <i className="dot" />}
              {t
                ? p?.status === "paused"
                  ? "Paused observation"
                  : p?.status === "replay"
                    ? "Recorded observation"
                    : t.status
                : "Awaiting observations"}
            </span>
          </div>
        </div>
        <dl className="detail-list">
          <dt>Class</dt>
          <dd>Drone (UAV)</dd>
          <dt>Confidence</dt>
          <dd>{t ? `${number(t.confidence * 100)}%` : "—"}</dd>
          <dt>Track duration</dt>
          <dd>{timecode(t?.duration)}</dd>
          <dt>Position</dt>
          <dd>
            {t
              ? `${number(t.center[0], 0)}, ${number(t.center[1], 0)} px`
              : "—"}
          </dd>
          <dt>Image velocity</dt>
          <dd>{number(t?.velocity.speed)} px/s</dd>
          <dt>Image direction</dt>
          <dd>{number(t?.direction)}°</dd>
          <dt>Distance</dt>
          <dd>
            N/A <small>No calibration</small>
          </dd>
          <dt>Altitude</dt>
          <dd>
            {altitude ? `${number(altitude.value)} m` : "N/A"}
            <small>{altitude?.source || "No telemetry"}</small>
          </dd>
        </dl>
        <div className="provenance">
          <Badge tone={t?.source === "simulation" ? "amber" : "cyan"}>
            {t?.source === "simulation" ? "SIMULATED TRACK" : "VISION ESTIMATE"}
          </Badge>
          <span>Pixels ≠ physical distance</span>
        </div>
      </div>
    </Panel>
  );
}
