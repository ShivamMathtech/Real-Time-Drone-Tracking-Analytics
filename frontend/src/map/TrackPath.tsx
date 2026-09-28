import { GPSPath } from "./GPSPath";
import { Route } from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { useApp } from "../stores/useApp";
import { number, timecode, trackColor } from "../utils/format";
export function TrackPath() {
  const gpsHistory = useApp((s) => s.history);
  const p = useApp((s) => s.packet),
    id = useApp((s) => s.selected);
  const t = p?.objects.find((o) => o.id === id);
  const telemetry = t ? p?.telemetry[String(t.id)] : null;
  const gps = telemetry?.latitude && telemetry?.longitude;
  if (gps && telemetry)
    return (
      <GPSPath
        history={gpsHistory}
        latitude={telemetry.latitude}
        longitude={telemetry.longitude}
      />
    );
  return (
    <Panel
      title="Image-space track path"
      icon={<Route size={15} />}
      action={<span className="eyebrow">TOP LEFT ORIGIN</span>}
    >
      <div className="track-path">
        <svg
          viewBox={`0 0 ${p?.width || 960} ${p?.height || 540}`}
          role="img"
          aria-label="Image-space trajectory"
        >
          <defs>
            <pattern
              id="path-grid"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="#185074"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#path-grid)" />
          {p?.objects.map((o) => (
            <g key={o.id} opacity={id === o.id ? 1 : 0.35}>
              <polyline
                points={o.history.map((h) => `${h.x},${h.y}`).join(" ")}
                fill="none"
                stroke={trackColor(o.id)}
                strokeWidth="4"
              />
              {o.history[0] && (
                <circle
                  cx={o.history[0].x}
                  cy={o.history[0].y}
                  r="7"
                  fill="#ffd079"
                />
              )}
              <circle
                cx={o.center[0]}
                cy={o.center[1]}
                r="12"
                fill={trackColor(o.id)}
                fillOpacity=".2"
                stroke={trackColor(o.id)}
                strokeWidth="3"
              />
              <circle
                cx={o.center[0]}
                cy={o.center[1]}
                r="4"
                fill={trackColor(o.id)}
              />
            </g>
          ))}
        </svg>
        <dl>
          <dt>Path length</dt>
          <dd>{number(t?.path_length)} px</dd>
          <dt>Average speed</dt>
          <dd>{number(t?.avg_speed)} px/s</dd>
          <dt>Maximum speed</dt>
          <dd>{number(t?.max_speed)} px/s</dd>
          <dt>Track duration</dt>
          <dd>{timecode(t?.duration)}</dd>
        </dl>
      </div>
      {gps ? (
        <div className="panel-footnote">
          GPS telemetry: {number(telemetry.latitude.value, 6)},{" "}
          {number(telemetry.longitude.value, 6)} ·{" "}
          <a
            href={`https://www.openstreetmap.org/?mlat=${telemetry.latitude.value}&mlon=${telemetry.longitude.value}#map=16/${telemetry.latitude.value}/${telemetry.longitude.value}`}
            target="_blank"
            rel="noreferrer"
          >
            Open actual position on map ↗
          </a>
        </div>
      ) : (
        <div className="path-legend">
          <span>
            <i className="dot" />
            Current position
          </span>
          <span>
            <i className="dot amber" />
            Trail start
          </span>
          <span>2D IMAGE PLANE · NOT GPS</span>
        </div>
      )}
    </Panel>
  );
}
