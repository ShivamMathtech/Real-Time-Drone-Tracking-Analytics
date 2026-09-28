import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Crosshair,
  ChartNoAxesCombined,
  ScrollText,
  Settings2,
  Maximize,
  Minimize,
  Radio,
  ExternalLink,
  X,
  Activity,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useApp } from "../stores/useApp";
import { useTrackingSocket } from "../hooks/useTrackingSocket";
export function SystemStatus() {
  const connection = useApp((s) => s.connection);
  return (
    <span className={"system-status " + connection}>
      <i />
      {connection === "online"
        ? "SYSTEM ONLINE"
        : connection === "connecting"
          ? "CONNECTING"
          : "DISCONNECTED"}
    </span>
  );
}
export function AppLayout() {
  useTrackingSocket();
  const [clock, setClock] = useState(new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const { error, notice } = useApp((s) => s);
  const theme = useApp((s) => s.settings.theme);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    const listener = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", listener);
    return () => {
      clearInterval(timer);
      document.removeEventListener("fullscreenchange", listener);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      useApp.getState().fail("Fullscreen is unavailable in this browser.");
    }
  };
  return (
    <div className="application">
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="MathTech home">
          <img src="/logo.svg" alt="" />
          <div>
            <strong>
              Math<span>Tech</span>
            </strong>
            <small>I HAVE NO LIMITATION</small>
          </div>
        </NavLink>
        <nav aria-label="Main navigation">
          {[
            ["/", "LIVE TRACKING", Crosshair],
            ["/analytics", "ANALYTICS", ChartNoAxesCombined],
            ["/logs", "LOGS", ScrollText],
            ["/settings", "SETTINGS", Settings2],
          ].map(([url, name, Icon]) => {
            const I = Icon as typeof Crosshair;
            return (
              <NavLink end key={String(url)} to={String(url)}>
                <I size={16} />
                <span>{String(name)}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="topbar-end">
          <SystemStatus />
          <time>
            {clock.toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            <b>{clock.toLocaleTimeString()}</b>
          </time>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle fullscreen"
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </Button>
        </div>
      </header>
      {(error || notice) && (
        <div
          className={"toast " + (error ? "toast-error" : "")}
          role={error ? "alert" : "status"}
        >
          <span>{error || notice}</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Dismiss notification"
            onClick={() => useApp.getState().set({ error: null, notice: null })}
          >
            <X size={16} />
          </Button>
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <span>
          <img src="/logo.svg" alt="" />
          MathTech <i />
          AI <i />
          COMPUTER VISION <i />
          ROBOTICS
        </span>
        <span>
          <Activity size={12} /> OBSERVE · ANALYZE · UNDERSTAND <i />
          <a href="/api/health" target="_blank" rel="noreferrer">
            API status <ExternalLink size={11} />
          </a>
        </span>
      </footer>
    </div>
  );
}
