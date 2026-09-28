import type { Packet, ViewMode, Overlays } from "../types";
import { trackColor } from "../utils/format";
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  packet: Packet,
  selected: number | null,
  mode: ViewMode,
  overlay: Overlays,
) {
  const { width: w, height: h } = packet;
  ctx.save();
  ctx.lineWidth = 1.8;
  ctx.font = "13px ui-monospace, monospace";
  if (overlay.grid) {
    ctx.strokeStyle = "#2db7eb33";
    ctx.lineWidth = 0.6;
    for (let x = 0; x < w; x += w / 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += h / 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }
  if (mode !== "original")
    for (const t of packet.objects) {
      const color = trackColor(t.id);
      const [x1, y1, x2, y2] = t.bbox;
      const [cx, cy] = t.center;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = selected === t.id ? 2 : 1.3;
      ctx.setLineDash(t.status === "lost" ? [7, 5] : []);
      if ((overlay.trail || mode === "trail") && t.history.length > 1) {
        ctx.beginPath();
        t.history.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (mode === "mask" && t.mask?.length) {
        ctx.beginPath();
        t.mask.forEach((p, i) =>
          i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
        );
        ctx.closePath();
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (overlay.boxes) {
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        const len = 9;
        ctx.lineWidth = 3;
        for (const [x, y, sx, sy] of [
          [x1, y1, 1, 1],
          [x2, y1, -1, 1],
          [x1, y2, 1, -1],
          [x2, y2, -1, -1],
        ]) {
          ctx.beginPath();
          ctx.moveTo(x + sx * len, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + sy * len);
          ctx.stroke();
        }
      }
      const label = [
        overlay.ids ? `DRONE #${t.id}` : "",
        overlay.confidence ? `${(t.confidence * 100).toFixed(1)}%` : "",
        t.status === "lost" ? "LOST" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (label) {
        ctx.font = "bold 12px ui-monospace, monospace";
        const ly = Math.max(20, y1);
        ctx.fillStyle = "#02141de8";
        ctx.fillRect(x1, ly - 23, ctx.measureText(label).width + 16, 20);
        ctx.fillStyle = color;
        ctx.fillText(label, x1 + 8, ly - 9);
      }
      if (overlay.centers) {
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (overlay.vectors && t.velocity.speed > 0.5) {
        const dx = t.velocity.x * 0.65,
          dy = t.velocity.y * 0.65;
        const a = Math.atan2(dy, dx);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.lineTo(
          cx + dx - 9 * Math.cos(a - 0.45),
          cy + dy - 9 * Math.sin(a - 0.45),
        );
        ctx.moveTo(cx + dx, cy + dy);
        ctx.lineTo(
          cx + dx - 9 * Math.cos(a + 0.45),
          cy + dy - 9 * Math.sin(a + 0.45),
        );
        ctx.stroke();
      }
      if (overlay.coordinates) {
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "#e7f5fc";
        ctx.fillText(
          `x ${cx.toFixed(0)}  y ${cy.toFixed(0)} px`,
          x1,
          Math.min(h - 40, y2 + 17),
        );
      }
      if (t.predicted_center) {
        ctx.strokeStyle = "#ffd079";
        ctx.beginPath();
        ctx.arc(
          t.predicted_center[0],
          t.predicted_center[1],
          7,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
  ctx.setLineDash([]);
  ctx.fillStyle = "#03111fe0";
  ctx.fillRect(0, h - 27, w, 27);
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = "#b8d6e6";
  ctx.fillText(
    `${packet.data_source === "simulation" ? "DEMO MODE · SIMULATED" : "VISION ESTIMATE"} | ${packet.source_label} | ${new Date(packet.timestamp * 1000).toISOString()} | SESSION ${packet.session_id?.slice(0, 8) || "—"}`,
    12,
    h - 10,
  );
  if (mode === "thermal") {
    ctx.fillStyle = "#ffca73";
    ctx.fillText("THERMAL SIMULATION — colorized visible-light pixels", 12, 22);
  }
  ctx.restore();
}
