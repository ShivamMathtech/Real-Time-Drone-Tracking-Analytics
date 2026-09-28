import { Drone } from "./ui/Drone";
import { Navigation } from "lucide-react";
import { Panel } from "./ui/Panel";
import { useApp } from "../stores/useApp";
import { number } from "../utils/format";
export function DirectionCompass() {
  const t = useApp((s) => s.packet?.objects.find((t) => t.id === s.selected));
  const direction = t?.direction || 0;
  const labels = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
  return (
    <Panel title="Movement direction" icon={<Navigation size={15} />}>
      <div className="compass-content">
        <div className="compass">
          <svg
            viewBox="0 0 140 140"
            role="img"
            aria-label={`Image direction ${number(t?.direction)} degrees`}
          >
            <circle cx="70" cy="70" r="48" fill="none" stroke="#15435e" />
            <circle
              cx="70"
              cy="70"
              r="36"
              fill="none"
              stroke="#164561"
              strokeDasharray="2 8"
            />
            <path d="M70 18V122 M18 70H122" stroke="#205272" />
            {["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((v, i) => {
              const a = ((i * 45 - 90) * Math.PI) / 180;
              return (
                <text
                  key={v}
                  x={70 + 60 * Math.cos(a)}
                  y={74 + 60 * Math.sin(a)}
                  textAnchor="middle"
                  fill={i % 2 ? "#52748e" : "#a1c6dd"}
                  fontSize={i % 2 ? 8 : 11}
                >
                  {v}
                </text>
              );
            })}
            {t && (
              <g transform={`rotate(${direction + 90} 70 70)`}>
                <path d="M70 27L64 49L70 44L76 49Z" fill="#17b9f3" />
                <line x1="70" y1="45" x2="70" y2="59" stroke="#17b9f3" />
              </g>
            )}
          </svg>
          <Drone size={24} />
        </div>
        <dl>
          <dt>Image heading</dt>
          <dd>{number(t?.direction)}°</dd>
          <dt>Movement</dt>
          <dd>{t ? labels[Math.round(direction / 45) % 8] : "—"}</dd>
          <dt>Angular velocity</dt>
          <dd>{number(t?.angular_velocity)}°/s</dd>
        </dl>
      </div>
      <div className="panel-footnote">
        IMAGE-SPACE DIRECTION · north means screen up
      </div>
    </Panel>
  );
}
