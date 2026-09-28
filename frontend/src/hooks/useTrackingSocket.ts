import { useEffect } from "react";
import { api, wsURL, getKey } from "../services/api";
import { useApp } from "../stores/useApp";
import type { Settings, ModelInfo, Packet } from "../types";
export function useTrackingSocket() {
  const revision = useApp((s) => s.apiRevision);
  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let retries = 0;
    const connect = () => {
      if (stopped) return;
      useApp.getState().set({ connection: "connecting" });
      socket = new WebSocket(wsURL());
      socket.onopen = () => {
        socket?.send(JSON.stringify({ api_key: getKey() }));
      };
      socket.onmessage = (event) => {
        let p: Packet & { type?: string };
        try {
          p = JSON.parse(event.data);
        } catch {
          return;
        }
        retries = 0;
        useApp.getState().set({ connection: "online" });
        if (p.type === "heartbeat") return;
        if (!useApp.getState().replay) useApp.getState().ingest(p);
      };
      socket.onerror = () => socket?.close();
      socket.onclose = (event) => {
        if (stopped) return;
        useApp.getState().set({ connection: "offline" });
        if (event.code === 1008) {
          useApp
            .getState()
            .fail(
              "Connection denied. Check the API key in Settings and backend CORS origins.",
            );
          return;
        }
        timer = setTimeout(
          connect,
          Math.min(10000, 500 * 2 ** retries++) + Math.random() * 250,
        );
      };
    };
    connect();
    Promise.all([api<Settings>("/api/settings"), api<ModelInfo>("/api/models")])
      .then(([settings, models]) => {
        if (!stopped) useApp.getState().set({ settings, models });
      })
      .catch((e) => useApp.getState().fail(e));
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [revision]);
}
