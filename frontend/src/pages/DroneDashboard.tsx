import { Crosshair, Activity } from "lucide-react";
import { SourceControls } from "../components/SourceControls";
import { TrackingControls } from "../components/TrackingControls";
import { DetectedObjects } from "../components/DetectedObjects";
import { CameraViewer } from "../components/CameraViewer";
import { ViewModeSelector } from "../components/ViewModeSelector";
import { DroneDetails } from "../components/DroneDetails";
import { TelemetryCard } from "../components/TelemetryCard";
import { MovementChart } from "../charts/MovementChart";
import { SpeedChart } from "../charts/SpeedChart";
import { DirectionCompass } from "../components/DirectionCompass";
import { TrackPath } from "../map/TrackPath";
import { SessionControls, ReplayBar } from "../components/SessionControls";
import { useApp } from "../stores/useApp";
export function DroneDashboard() {
  const packet = useApp((s) => s.packet),
    busy = useApp((s) => s.busy);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <Crosshair size={12} /> UAV OBSERVATION SYSTEM / 01
          </span>
          <h1>
            MATH TECH <span>DRONE VISION</span>
          </h1>
          <p>Real-time drone tracking & analytics</p>
        </div>
        <SourceControls />
      </div>
      <ReplayBar />
      {busy && (
        <div className="working-indicator" role="status">
          Processing request…
        </div>
      )}
      <div className="dashboard-grid">
        <aside className="left-column">
          <TrackingControls />
          <DetectedObjects />
          <div className="research-note">
            <Activity size={16} />
            <p>
              Civilian research workspace.
              <br />
              <span>
                All motion uses image coordinates unless a telemetry source is
                explicitly connected.
              </span>
            </p>
          </div>
        </aside>
        <div className="camera-column">
          <CameraViewer />
          <ViewModeSelector />
          <SessionControls />
        </div>
        <div className="analysis-column">
          <div className="details-row">
            <DroneDetails />
            <TelemetryCard />
          </div>
          <MovementChart />
          <div className="motion-row">
            <SpeedChart />
            <DirectionCompass />
          </div>
          <TrackPath />
          <div className="analysis-footnote">
            {packet?.model || "No model loaded"} · {packet?.device || "CPU"} ·
            Single-stream research deployment
          </div>
        </div>
      </div>
    </>
  );
}
