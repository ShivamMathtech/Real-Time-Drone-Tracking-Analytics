import { useState } from "react";
import { Download, Search, ScrollText } from "lucide-react";
import { Panel, Badge } from "../components/ui/Panel";
import { Button } from "../components/ui/button";
import { useApp } from "../stores/useApp";
import { saveBlob } from "../services/api";
export function LogPanel() {
  const logs = useApp((s) => s.logs);
  const [level, setLevel] = useState("ALL"),
    [query, setQuery] = useState("");
  const filtered = logs.filter(
    (l) =>
      (level === "ALL" || l.level === level) &&
      `${l.message} ${l.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Panel
      title="Event stream"
      icon={<ScrollText size={16} />}
      action={<Badge>{filtered.length} EVENTS</Badge>}
    >
      <div className="log-toolbar">
        <div className="segmented">
          {["ALL", "INFO", "WARNING", "ERROR"].map((x) => (
            <button
              key={x}
              className={level === x ? "active" : ""}
              onClick={() => setLevel(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={14} />
          <input
            aria-label="Search logs"
            placeholder="Search events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          onClick={() =>
            saveBlob(
              new Blob([JSON.stringify(filtered, null, 2)], {
                type: "application/json",
              }),
              "MathTech-events.json",
            )
          }
        >
          <Download size={14} />
          Export logs
        </Button>
      </div>
      <div className="logs-table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Category</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>
            {[...filtered].reverse().map((l) => (
              <tr key={`${l.id}-${l.timestamp}`}>
                <td className="mono">
                  {new Date(l.timestamp * 1000).toLocaleTimeString()}
                </td>
                <td>
                  <Badge
                    tone={
                      l.level === "ERROR"
                        ? "amber"
                        : l.level === "WARNING"
                          ? "amber"
                          : "cyan"
                    }
                  >
                    {l.level}
                  </Badge>
                </td>
                <td>{l.category}</td>
                <td>{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty">No events match this filter.</div>
        )}
      </div>
    </Panel>
  );
}
export function LogsPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SYSTEM OBSERVABILITY / 03</span>
          <h1>
            System <span>logs</span>
          </h1>
          <p>
            Source events, track lifecycle, model status and recoverable errors.
          </p>
        </div>
      </div>
      <LogPanel />
    </>
  );
}
