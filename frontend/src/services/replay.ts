import { api, frameImage, post } from "./api";
import { useApp } from "../stores/useApp";
import { browserCamera } from "./browserCamera";
import type {
  SessionInfo,
  SessionDetail,
  Packet,
  HistoryPoint,
} from "../types";
class ReplayController {
  private page: Packet[] = [];
  private offset = 0;
  private index = 0;
  private session: SessionInfo | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private history: Record<number, HistoryPoint[]> = {};
  private generation = 0;
  private speed = 1;
  private playing = false;
  async load(session: SessionInfo) {
    this.pause();
    browserCamera.stop();
    await post("/api/source/stop");
    if (!session.frame_count)
      throw new Error("This session has no tracking records.");
    this.session = session;
    this.page = [];
    this.history = {};
    this.generation++;
    useApp
      .getState()
      .set({ replay: session, replayImage: null, history: [], selected: null });
    await this.show(0);
  }
  async show(index: number) {
    if (!this.session) return;
    const revision = ++this.generation;
    const old = this.index;
    this.index = Math.max(0, Math.min(index, this.session.frame_count - 1));
    if (this.index < old) this.history = {};
    if (
      !this.page.length ||
      this.index < this.offset ||
      this.index >= this.offset + this.page.length
    ) {
      this.offset = Math.floor(this.index / 300) * 300;
      const data = await api<SessionDetail>(
        `/api/session/${this.session.id}?offset=${this.offset}&limit=300`,
      );
      if (revision !== this.generation) return;
      this.page = data.frames;
    }
    const frame = this.page[this.index - this.offset];
    if (!frame) return;
    const objects = frame.objects.map((t) => {
      const history = this.history[t.id] || [];
      if (t.status === "tracking" && history.at(-1)?.timestamp !== t.timestamp)
        history.push({
          x: t.center[0],
          y: t.center[1],
          timestamp: t.timestamp,
        });
      this.history[t.id] = history.slice(-100);
      return { ...t, history: this.history[t.id] };
    });
    let image: string | null = null;
    if (frame.has_image)
      image = await frameImage(
        `/api/session/${this.session.id}/frame/${frame.frame_index}`,
      );
    if (revision !== this.generation) {
      if (image) URL.revokeObjectURL(image);
      return;
    }
    const previous = useApp.getState().replayImage;
    if (previous) URL.revokeObjectURL(previous);
    useApp.getState().set({ replayImage: image });
    useApp
      .getState()
      .ingest({
        ...frame,
        objects,
        frame: null,
        status: "replay",
        logs: [],
        playback_speed: this.speed,
      });
  }
  play() {
    this.pause();
    if (!this.session) return;
    this.playing = true;
    useApp.getState().notify("Replaying saved session records.");
    const advance = async () => {
      if (
        !this.playing ||
        !this.session ||
        this.index >= this.session.frame_count - 1
      ) {
        this.pause();
        return;
      }
      const current = this.page[this.index - this.offset];
      const next = this.page[this.index - this.offset + 1];
      const delay = Math.max(
        16,
        Math.min(
          2000,
          (((next?.video_time ?? current.video_time + 0.05) -
            current.video_time) *
            1000) /
            this.speed,
        ),
      );
      this.timer = setTimeout(
        () =>
          void this.show(this.index + 1)
            .then(advance)
            .catch(useApp.getState().fail),
        delay,
      );
    };
    void advance();
  }
  pause() {
    this.playing = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  seek(index: number) {
    this.pause();
    useApp.getState().set({ history: [] });
    this.history = {};
    return this.show(index);
  }
  setSpeed(speed: number) {
    this.speed = speed;
  }
  exit() {
    this.pause();
    this.session = null;
    this.generation++;
    const image = useApp.getState().replayImage;
    if (image) URL.revokeObjectURL(image);
    useApp
      .getState()
      .set({
        replay: null,
        replayImage: null,
        history: [],
        packet: null,
        apiRevision: useApp.getState().apiRevision + 1,
      });
  }
}
export const replayController = new ReplayController();
