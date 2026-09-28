export const number = (n: number | undefined | null, digits = 1) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
export const timecode = (t: number = 0) => {
  const n = Math.max(0, Math.floor(t));
  return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60]
    .map((x) => String(x).padStart(2, "0"))
    .join(":");
};
export const colors = ["#27dca5", "#29baf0", "#c994ff", "#ffd079", "#fc8cab"];
export const trackColor = (id: number) => colors[(id - 1) % colors.length];
