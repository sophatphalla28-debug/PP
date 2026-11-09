const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const ONE_DP = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export const fmtInt = (n: number) => INT.format(Math.round(n));

/** 1,284 · 12.9K · 4.2M — full digits below 10,000. */
export function fmtCompact(n: number): string {
  return Math.abs(n) < 10_000 ? INT.format(Math.round(n)) : COMPACT.format(n);
}

export function fmtHours(h: number): string {
  if (h > 0 && h < 10) return ONE_DP.format(h);
  return INT.format(Math.round(h));
}

export function fmtPct(p: number | null, digits = 0): string {
  if (p === null || !Number.isFinite(p)) return "n/a";
  const rounded = Number(p.toFixed(digits));
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}%`;
}

export function fmtSigned(n: number): string {
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "−"}${INT.format(Math.abs(Math.round(n)))}`;
}

/** Seconds → "4:05" or "1:02:09". */
export function fmtDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "n/a";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "n/a";
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`;
}

export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
export const channelUrl = (id: string) => `https://www.youtube.com/channel/${encodeURIComponent(id)}`;
