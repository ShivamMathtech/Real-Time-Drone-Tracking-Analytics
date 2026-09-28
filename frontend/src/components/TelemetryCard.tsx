import {
  Radio,
  MoveHorizontal,
  MoveVertical,
  Mountain,
  Gauge,
  Compass,
  Battery,
  Wifi,
  Timer,
} from "lucide-react";
import { Panel } from "./ui/Panel";
import { useApp } from "../stores/useApp";
import { number } from "../utils/format";
export function TelemetryCard() {
  const p = useApp((s) => s.packet),
    id = useApp((s) => s.selected);
  const t = p?.objects.find((t) => t.id === id);
  const telemetry = t ? p?.telemetry[String(t.id)] || {} : {};
  const pixelSource = t?.source === "simulation" ? "SIMULATION" : "VISION";
  const metrics = [
    {
      name: "X position",
      value: t?.center[0],
      unit: "px",
      source: pixelSource,
      Icon: MoveHorizontal,
    },
    {
      name: "Y position",
      value: t?.center[1],
      unit: "px",
      source: pixelSource,
      Icon: MoveVertical,
    },
    ...(
      [
        ["altitude", "Altitude", "m", Mountain],
        ["speed", "Speed", "m/s", Gauge],
        ["heading", "Heading", "°", Compass],
        ["battery", "Battery", "%", Battery],
        ["signal", "Signal quality", "%", Wifi],
      ] as const
    ).map(([key, name, unit, Icon]) => ({
      name,
      value: telemetry[key]?.value,
      unit,
      source: telemetry[key]?.source.toUpperCase() || "NO TELEMETRY",
      Icon,
    })),
    {
      name: "Inference",
      value: p?.latency_ms,
      unit: "ms",
      source: p?.data_source === "simulation" ? "SIM GENERATION" : "MEASURED",
      Icon: Timer,
    },
  ];
  return (
    <Panel title="Real-time telemetry" icon={<Radio size={15} />}>
      <div className="telemetry-grid">
        {metrics.map(({ name, value, unit, source, Icon }) => (
          <div className="telemetry-metric" key={name}>
            <Icon size={18} />
            <span>
              {name}
              <b>
                {value == null ? "N/A" : number(value)}
                <em>{value == null ? "" : unit}</em>
              </b>
              <small className={source === "SIMULATION" ? "amber" : ""}>
                {source}
              </small>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
