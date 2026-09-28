import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ChartNoAxesCombined,
  Layers,
  Gauge,
  ScanLine,
  Clock,
  Activity,
  Target,
  Timer,
} from "lucide-react";
import { Panel, Badge } from "../components/ui/Panel";
import { useApp } from "../stores/useApp";
import { number, timecode } from "../utils/format";
import { LinePlot, MovementChart } from "../charts/MovementChart";
import { SpeedChart } from "../charts/SpeedChart";
import { SessionControls, ReplayBar } from "../components/SessionControls";
export function AnalyticsPage() {
  const p = useApp((s) => s.packet),
    history = useApp((s) => s.history);
  const stats = p?.statistics;
  const metrics = [
    ["Detection observations", stats?.total_detections, ScanLine, ""],
    ["Unique track IDs", stats?.unique_tracks, Layers, ""],
    ["Average confidence", (stats?.average_confidence || 0) * 100, Target, "%"],
    ["Average FPS", stats?.average_fps, Gauge, ""],
    ["Average inference", stats?.average_latency, Timer, "ms"],
    ["Longest track", stats?.longest_track, Clock, "s"],
    ["Tracking time", stats?.total_tracking_time, Activity, "s"],
  ];
  const dirs = Object.entries(stats?.direction_distribution || {}).map(
    ([direction, count]) => ({ direction: direction + "°", count }),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RESEARCH INSIGHTS / 02</span>
          <h1>
            Session <span>analytics</span>
          </h1>
          <p>
            Measured pipeline performance and image-space motion, synchronized
            to source timestamps.
          </p>
        </div>
        <Badge tone={p?.data_source === "simulation" ? "amber" : "cyan"}>
          {p?.data_source === "simulation"
            ? "DEMO MODE · SIMULATED"
            : "VISION ANALYTICS"}
        </Badge>
      </div>
      <ReplayBar />
      <div className="metric-strip">
        {metrics.map(([label, value, Icon, unit]) => {
          const I = Icon as typeof Gauge;
          return (
            <div className="panel kpi" key={String(label)}>
              <I size={19} />
              <span>{String(label)}</span>
              <strong>
                {number(
                  value as number,
                  typeof value === "number" && Number.isInteger(value) ? 0 : 1,
                )}
                <small>{String(unit)}</small>
              </strong>
            </div>
          );
        })}
      </div>
      <div className="analytics-grid">
        <MovementChart />
        <SpeedChart />
        <Panel title="Track count over time">
          <LinePlot
            height={220}
            data={history}
            lines={[{ key: "count", name: "Active tracks", color: "#19b9f4" }]}
          />
        </Panel>
        <Panel title="Confidence over time">
          <LinePlot
            height={220}
            data={history}
            lines={[
              {
                key: "confidence",
                name: "Selected track confidence (0–1)",
                color: "#23d6a0",
              },
            ]}
          />
        </Panel>
        <Panel title="Direction distribution">
          <p className="chart-subtitle">IMAGE-SPACE OBSERVATIONS · 45° BINS</p>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={dirs}>
                <CartesianGrid stroke="#42658022" />
                <XAxis
                  dataKey="direction"
                  tick={{ fill: "#7795ad", fontSize: 11 }}
                />
                <YAxis tick={{ fill: "#7795ad", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#102536",
                    border: "1px solid #28506a",
                  }}
                />
                <Bar dataKey="count" fill="#1699d3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Detection frequency & throughput">
          <LinePlot
            height={240}
            data={history}
            lines={[
              {
                key: "fps",
                name: "Processed frames / wall second",
                color: "#af83f2",
              },
              {
                key: "count",
                name: "Detections per sampled frame",
                color: "#ffc766",
                axis: "right",
              },
            ]}
          />
        </Panel>
      </div>
      <SessionControls />
    </>
  );
}
