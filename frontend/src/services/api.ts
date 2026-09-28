export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export function wsURL(path = "/ws/tracking") {
  if (path === "/ws/tracking" && import.meta.env.VITE_WS_URL)
    return import.meta.env.VITE_WS_URL;
  const base = API_BASE || location.origin;
  return base.replace(/^http/, "ws") + path;
}
export function getKey() {
  return sessionStorage.getItem("mathtech-api-key") || "";
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const key = getKey();
  if (key) headers.set("X-API-Key", key);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = (await response.json()).detail;
    } catch {
      detail = response.statusText;
    }
    throw new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail),
    );
  }
  return response.json();
}
export const post = <T = unknown>(path: string, data?: unknown) =>
  api<T>(path, {
    method: "POST",
    body: data === undefined ? undefined : JSON.stringify(data),
  });
export async function download(path: string, name: string) {
  const response = await fetch(API_BASE + path, {
    headers: { "X-API-Key": getKey() },
  });
  if (!response.ok)
    throw new Error("Download failed; check the session and API key.");
  saveBlob(await response.blob(), name);
}
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export async function frameImage(path: string) {
  const r = await fetch(API_BASE + path, {
    headers: { "X-API-Key": getKey() },
  });
  if (!r.ok) return null;
  return URL.createObjectURL(await r.blob());
}
