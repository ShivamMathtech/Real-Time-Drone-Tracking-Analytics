import { MapPin } from "lucide-react";
import { Panel, Badge } from "../components/ui/Panel";
import type { ChartPoint, Metric } from "../types";
import { number } from "../utils/format";
const radians = (degrees: number) => (degrees * Math.PI) / 180;
function meters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const dlat = radians(b.lat - a.lat),
    dlon = radians(b.lon - a.lon);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function GPSPath({
  history,
  latitude,
  longitude,
}: {
  history: ChartPoint[];
  latitude: Metric;
  longitude: Metric;
}) {
  const points = history
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({ lat: p.latitude!, lon: p.longitude! }));
  points.push({ lat: latitude.value, lon: longitude.value });
  // Local tangent projection, centered on supplied WGS84 coordinates. No GPS is inferred.
  const origin = points[0],
    projected = points.map((p) => ({
      x:
        6371000 *
        radians(((p.lon - origin.lon + 540) % 360) - 180) *
        Math.cos(radians(origin.lat)),
      y: -6371000 * radians(p.lat - origin.lat),
    }));
  const minX = Math.min(...projected.map((p) => p.x)),
    maxX = Math.max(...projected.map((p) => p.x)),
    minY = Math.min(...projected.map((p) => p.y)),
    maxY = Math.max(...projected.map((p) => p.y));
  const span = Math.max(50, (maxX - minX) * 1.25, (maxY - minY) * 2.5),
    cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const coords = projected.map((p) => ({
    x: 300 + ((p.x - cx) / span) * 560,
    y: 145 + ((p.y - cy) / span) * 560,
  }));
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += meters(points[i - 1], points[i]);
  const last = coords.at(-1)!;
  return (
    <Panel
      title="GPS track path"
      icon={<MapPin size={15} />}
      action={<Badge tone="green">TELEMETRY · WGS84</Badge>}
    >
      <div className="gps-map">
        <svg
          viewBox="0 0 600 290"
          role="img"
          aria-label="Georeferenced trajectory from GPS telemetry"
        >
          <defs>
            <pattern
              id="gps-grid"
              width="50"
              height="50"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M50 0H0V50"
                stroke="#205072"
                strokeWidth=".5"
                fill="none"
              />
            </pattern>
          </defs>
          <rect width="600" height="290" fill="url(#gps-grid)" />
          <polyline
            points={coords.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke="#25d9a5"
            fill="none"
            strokeWidth="2.5"
          />
          <circle cx={coords[0].x} cy={coords[0].y} r="4" fill="#ffd079" />
          <circle cx={last.x} cy={last.y} r="6" fill="#25d9a5" />
          <text x="20" y="25" fill="#b5d4e4" fontSize="10">
            N ↑ · local geographic projection
          </text>
          <path d="M20 250V255H132V250" fill="none" stroke="#abc9dc" />
          <text x="20" y="275" fill="#abc9dc" fontSize="10">
            {number(span / 5, 0)} m
          </text>
        </svg>
      </div>
      <div className="gps-stats">
        <span>
          {number(latitude.value, 6)}°, {number(longitude.value, 6)}°
        </span>
        <span>Visible path: {number(length)} m</span>
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude.value}&mlon=${longitude.value}#map=16/${latitude.value}/${longitude.value}`}
          target="_blank"
          rel="noreferrer"
        >
          Open geographic map ↗
        </a>
      </div>
      <div className="panel-footnote">
        Operator-associated sensor coordinates · north up · no background tiles
        requested automatically. Large-scale/geodesic analysis should use
        exported telemetry.
      </div>
    </Panel>
  );
}
