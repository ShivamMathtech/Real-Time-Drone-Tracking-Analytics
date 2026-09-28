import { post, wsURL, getKey } from "./api";
import { useApp } from "../stores/useApp";
class BrowserCamera {
  private stream: MediaStream | null = null;
  private socket: WebSocket | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  async start() {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Camera requires HTTPS or localhost and a supported browser.",
      );
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e) {
      throw new Error(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access in your browser."
          : "Camera unavailable. Check the device and close other camera applications.",
      );
    }
    try {
      this.video = document.createElement("video");
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = this.stream;
      await this.video.play();
      await post("/api/source/start", { kind: "webcam" });
      this.active = true;
      this.socket = new WebSocket(wsURL("/ws/camera"));
      const canvas = document.createElement("canvas");
      const send = async () => {
        if (
          !this.active ||
          !this.video ||
          this.socket?.readyState !== WebSocket.OPEN
        )
          return;
        const width = Math.min(
          useApp.getState().settings.processing_width,
          1280,
          this.video.videoWidth,
        );
        canvas.width = width;
        canvas.height = Math.round(
          (this.video.videoHeight * width) / this.video.videoWidth,
        );
        canvas
          .getContext("2d")
          ?.drawImage(this.video, 0, 0, canvas.width, canvas.height);
        const timestamp = performance.now() / 1000;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.8),
        );
        if (blob && this.socket?.readyState === WebSocket.OPEN && this.active) {
          this.socket.send(JSON.stringify({ timestamp }));
          this.socket.send(blob);
        }
      };
      this.socket.onopen = () => {
        this.socket?.send(JSON.stringify({ api_key: getKey() }));
        void send();
      };
      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) {
          useApp.getState().fail(data.error);
          this.stop();
          return;
        }
        this.timer = setTimeout(
          () => void send(),
          1000 / useApp.getState().settings.fps_limit,
        );
      };
      this.socket.onclose = () => {
        if (this.active) {
          useApp
            .getState()
            .fail(
              "Camera connection closed. Start the camera again to reconnect.",
            );
          this.stop();
        }
      };
      this.stream.getVideoTracks()[0].onended = () => {
        this.stop();
        void post("/api/source/stop").catch(() => {});
      };
    } catch (e) {
      this.stop();
      throw e;
    }
  }
  stop() {
    this.active = false;
    clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
  }
}
export const browserCamera = new BrowserCamera();
window.addEventListener("beforeunload", () => browserCamera.stop());
