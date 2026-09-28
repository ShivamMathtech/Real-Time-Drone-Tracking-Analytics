import { Gauge } from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { useApp } from "../stores/useApp";
import { LinePlot } from "./MovementChart";
export function SpeedChart() {
  const history = useApp((s) => s.history),
    window = useApp((s) => s.windowSeconds);
  const last = history.at(-1)?.t || 0;
  const data = history.filter((p) => p.t >= last - window);
  const hasAltitude = data.some((p) => p.altitude != null);
  const sim = data.some((p) => p.altitudeSource === "simulation");
  return (
    <Panel title="Speed & altitude" icon={<Gauge size={15} />}>
      <p className="chart-subtitle">
        IMAGE SPEED · px/s{" "}
        <span>
          {hasAltitude
            ? sim
              ? "SIMULATED ALTITUDE · m"
              : "TELEMETRY ALTITUDE · m"
            : "ALTITUDE: NO TELEMETRY"}
        </span>
      </p>
      <LinePlot
        height={139}
        data={data}
        lines={[
          { key: "speed", name: "Image speed (px/s)", color: "#ffc766" },
          ...(hasAltitude
            ? [
                {
                  key: "altitude",
                  name: (sim ? "Sim. " : "") + "Altitude (m)",
                  color: "#b885ff",
                  axis: "right",
                },
              ]
            : []),
        ]}
      />
    </Panel>
  );
}
