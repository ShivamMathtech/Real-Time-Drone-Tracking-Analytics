import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { ChartNoAxesCombined } from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { useApp } from "../stores/useApp";
import type { ChartPoint } from "../types";
const axis = { fill: "#7795ad", fontSize: 10 };
export function LinePlot({
  data,
  lines,
  height = 150,
}: {
  data: ChartPoint[];
  lines: { key: string; name: string; color: string; axis?: string }[];
  height?: number;
}) {
  return (
    <div className="chart" style={{ height, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 10, left: -12, bottom: 0 }}
        >
          <CartesianGrid stroke="#42658022" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={axis}
            tickFormatter={(v) => `${Number(v).toFixed(0)}s`}
            minTickGap={32}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={axis}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          {lines.some((x) => x.axis === "right") && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={axis}
              axisLine={false}
              tickLine={false}
              width={40}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "#0a1928",
              border: "1px solid #254b66",
              borderRadius: 6,
              fontSize: 11,
              color: "#e0f2fe",
            }}
            labelFormatter={(v) => `Video time: ${Number(v).toFixed(2)} s`}
            formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
          />
          <Legend
            iconType="circle"
            iconSize={6}
            wrapperStyle={{ fontSize: 10 }}
          />
          {lines.map((l) => (
            <Line
              key={l.key}
              yAxisId={l.axis || "left"}
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              type="linear"
              dot={false}
              strokeWidth={1.7}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function MovementChart() {
  const history = useApp((s) => s.history),
    window = useApp((s) => s.windowSeconds);
  const last = history.at(-1)?.t || 0;
  const data = history.filter((p) => p.t >= last - window);
  return (
    <Panel
      title="Movement analysis"
      icon={<ChartNoAxesCombined size={15} />}
      action={
        <select
          className="tiny-select"
          aria-label="Chart time window"
          value={window}
          onChange={(e) =>
            useApp.getState().set({ windowSeconds: Number(e.target.value) })
          }
        >
          {[1, 5, 10, 30, 60, 300].map((x) => (
            <option key={x} value={x}>
              {x === 300 ? "5 min" : x + " sec"}
            </option>
          ))}
        </select>
      }
    >
      <p className="chart-subtitle">
        POSITION OVER TIME <span>IMAGE COORDINATES · px</span>
      </p>
      <LinePlot
        data={data}
        lines={[
          { key: "x", name: "X position", color: "#19b9f4" },
          { key: "y", name: "Y position", color: "#21dfa2" },
        ]}
      />
    </Panel>
  );
}
