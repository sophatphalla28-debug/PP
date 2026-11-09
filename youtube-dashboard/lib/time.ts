/**
 * Calendar helpers. Weeks run Sunday 00:00 → Saturday 23:59 in Korea time (Asia/Seoul, UTC+9, no DST).
 * Dates are plain 'YYYY-MM-DD' strings throughout to avoid timezone drift.
 */
export const REPORT_TIMEZONE = "Asia/Seoul";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DateStr = string;

function fromUtcMidnight(ms: number): DateStr {
  return new Date(ms).toISOString().slice(0, 10);
}

function toUtcMidnight(d: DateStr): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function isDateStr(s: unknown): s is DateStr {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtcMidnight(s));
}

/** Calendar date in Korea for an instant. */
export function kstDate(now: Date): DateStr {
  return fromUtcMidnight(now.getTime() + KST_OFFSET_MS);
}

/** Calendar date in an arbitrary IANA zone (used for Pacific-time API dates and quota days). */
export function zonedDate(now: Date, timeZone: string): DateStr {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const pacificDate = (now: Date) => zonedDate(now, "America/Los_Angeles");

export function addDays(d: DateStr, n: number): DateStr {
  return fromUtcMidnight(toUtcMidnight(d) + n * DAY_MS);
}

export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUtcMidnight(a) - toUtcMidnight(b)) / DAY_MS);
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a < b ? a : b;
}

export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a > b ? a : b;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(d: DateStr): number {
  return new Date(toUtcMidnight(d)).getUTCDay();
}

/** Sunday that starts the week containing date `d`. */
export function weekStartOf(d: DateStr): DateStr {
  return addDays(d, -dayOfWeek(d));
}

export function weekEndOf(weekStart: DateStr): DateStr {
  return addDays(weekStart, 6);
}

export function currentWeekStart(now: Date): DateStr {
  return weekStartOf(kstDate(now));
}

/** The most recent fully elapsed Sunday–Saturday week in Korea time. */
export function lastCompletedWeekStart(now: Date): DateStr {
  return addDays(currentWeekStart(now), -7);
}

export function datesBetween(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** UTC instant of 00:00 KST on a given date. */
export function kstMidnightUtc(d: DateStr): Date {
  return new Date(toUtcMidnight(d) - KST_OFFSET_MS);
}

/** Next Sunday 08:00 KST strictly after `now` — when the weekly report is due. */
export function nextReportTime(now: Date): Date {
  let sunday = currentWeekStart(now);
  let at = new Date(kstMidnightUtc(sunday).getTime() + 8 * 60 * 60 * 1000);
  if (at.getTime() <= now.getTime()) {
    sunday = addDays(sunday, 7);
    at = new Date(kstMidnightUtc(sunday).getTime() + 8 * 60 * 60 * 1000);
  }
  return at;
}

const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const SHORT_NO_WD = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric" });

export function formatDay(d: DateStr): string {
  return SHORT.format(new Date(toUtcMidnight(d)));
}

export function formatDayShort(d: DateStr): string {
  return SHORT_NO_WD.format(new Date(toUtcMidnight(d)));
}

/** "Sun, Nov 2 – Sat, Nov 8, 2026" */
export function formatWeek(weekStart: DateStr): string {
  const end = weekEndOf(weekStart);
  return `${formatDay(weekStart)} – ${formatDay(end)}, ${YEAR.format(new Date(toUtcMidnight(end)))}`;
}

export function formatKstDateTime(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at) + " KST";
}
