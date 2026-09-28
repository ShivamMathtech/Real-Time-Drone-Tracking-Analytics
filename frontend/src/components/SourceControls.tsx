import { replayController } from "../services/replay";
import { useRef, useState } from "react";
import { Play, Video, Upload, Link2, Radio, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/Modal";
import { api, post } from "../services/api";
import { browserCamera } from "../services/browserCamera";
import { useApp, runAction } from "../stores/useApp";
export function SourceControls() {
  const input = useRef<HTMLInputElement>(null);
  const [network, setNetwork] = useState(false);
  const [url, setURL] = useState("");
  const [asset, setAsset] = useState<{
    asset_id: string;
    name: string;
    width: number;
    height: number;
    fps: number;
    duration: number | null;
  } | null>(null);
  const busy = useApp((s) => s.busy);
  const replay = useApp((s) => s.replay);
  const start = (kind: string, extra = {}) =>
    runAction(async () => {
      browserCamera.stop();
      if (useApp.getState().replay) replayController.exit();
      useApp.getState().set({ replay: null, replayImage: null, history: [] });
      await post("/api/source/start", { kind, ...extra });
    });
  return (
    <>
      <div className="source-controls">
        <Button
          size="sm"
          variant="default"
          disabled={busy}
          onClick={() => void start("demo")}
        >
          <Play size={13} />
          Demo mode
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void runAction(async () => {
              if (useApp.getState().replay) replayController.exit();
              await browserCamera.start();
            })
          }
        >
          <Video size={14} />
          Start camera
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={14} />
          Open video
        </Button>
        <Button size="sm" disabled={busy} onClick={() => setNetwork(true)}>
          <Link2 size={14} />
          Network
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !!replay}
          title="Close active video source"
          onClick={() =>
            void runAction(async () => {
              browserCamera.stop();
              await post("/api/source/stop");
            })
          }
        >
          <Square size={13} />
          Close source
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.avi,.mkv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file)
            void runAction(async () => {
              const data = new FormData();
              data.append("file", file);
              setAsset(
                await api("/api/video/upload", { method: "POST", body: data }),
              );
            });
        }}
      />
      {network && (
        <Modal title="Connect network camera" onClose={() => setNetwork(false)}>
          <p>
            Enable the RTSP adapter and allowlist the camera host in your
            backend configuration.
          </p>
          <label>
            RTSP address
            <input
              value={url}
              onChange={(e) => setURL(e.target.value)}
              type="url"
              placeholder="rtsp://camera-host:554/stream"
              autoComplete="off"
            />
          </label>
          <Button
            variant="default"
            disabled={!url || busy}
            onClick={() =>
              void start("rtsp", { url }).then(() => setNetwork(false))
            }
          >
            <Radio size={15} />
            Connect stream
          </Button>
        </Modal>
      )}
      {asset && (
        <Modal title="Video ready for analysis" onClose={() => setAsset(null)}>
          <p>{asset.name}</p>
          <div className="meta-grid">
            <span>
              Resolution
              <b>
                {asset.width} × {asset.height}
              </b>
            </span>
            <span>
              Frame rate<b>{asset.fps.toFixed(2)} FPS</b>
            </span>
            <span>
              Duration<b>{asset.duration?.toFixed(1) || "Unknown"} s</b>
            </span>
          </div>
          <p>
            Video preview works without a model. Detection starts when
            compatible drone weights are loaded.
          </p>
          <Button
            variant="default"
            disabled={busy}
            onClick={() =>
              void start("file", { asset_id: asset.asset_id }).then(() =>
                setAsset(null),
              )
            }
          >
            <Play size={16} />
            Start analysis
          </Button>
        </Modal>
      )}
    </>
  );
}
