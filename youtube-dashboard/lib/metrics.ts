import type { ChannelStatus, DailyRow, Snapshot, TopVideo } from "./repo";
import { addDays, datesBetween, diffDays, formatDay, formatWeek, weekEndOf, type DateStr } from "./time";

/**
 * Pure weekly calculations. Rules that keep the numbers honest:
 *  - A day counts only if YouTube has published it for that channel; unpublished days are "pending", never zero.
 *  - Growth compares the SAME days of the week (e.g. Sun–Thu vs Sun–Thu) when the current week is incomplete.
 *  - Missing data surfaces as `null`, which the UI and report render as "not available".
 */

export const GROWTH_THRESHOLD_PCT = 5;
/** A channel needs this many comparable views last week to be called "fastest-growing" / "biggest decline". */
export const MIN_BASE_VIEWS = 100;

export type ChannelMeta = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  customUrl: string | null;
  status: ChannelStatus;
  lastError: string | null;
  dataThrough: DateStr | null;
};

export type Totals = { views: number; watchHours: number; subscribersGained: number };

export type TrendStatus = "growing" | "declining" | "stable" | "new" | "no-data";

export type ChannelWeek = {
  channel: ChannelMeta;
  daysAvailable: number;
  views: number;
  watchHours: number;
  subscribersGained: number;
  subscribersLost: number;
  /** Previous week, same days as this week's available data. */
  lastSameDays: Totals;
  /** Previous week, all 7 days (as currently published). */
  lastFullWeek: Totals & { daysAvailable: number };
  /** This week restricted to the days both weeks have published. */
  comparable: { this: Totals; last: Totals; days: number };
  growthPct: number | null;
  uploads: number;
  uploadsLast: number;
  bestVideo: TopVideo | null;
  status: TrendStatus;
  lifetime: { views: number | null; subscribers: number | null; hiddenSubscribers: boolean };
};

export type Highlight = { channel: ChannelWeek; reason?: string } | null;

export type Completeness = {
  daysElapsed: number;
  minDays: number;
  maxDays: number;
  complete: boolean;
  inProgress: boolean;
  dataThrough: DateStr | null;
  note: string | null;
};

export type WeekSummary = {
  weekStart: DateStr;
  weekEnd: DateStr;
  label: string;
  channels: ChannelWeek[];
  totals: {
    views: number;
    watchHours: number;
    subscribersGained: number;
    subscribersLost: number;
    uploads: number;
    uploadsLast: number;
    lastSameDays: Totals;
    growthPct: number | null;
    subscribersGrowthPct: number | null;
    watchHoursGrowthPct: number | null;
    lifetimeViews: number | null;
    lifetimeSubscribers: number | null;
    channelsWithHiddenSubscribers: number;
  };
  highlights: {
    fastestGrowing: ChannelWeek | null;
    biggestDecline: ChannelWeek | null;
    highestViewed: ChannelWeek | null;
    mostSubscribers: ChannelWeek | null;
    bestVideo: TopVideo | null;
    needsAttention: { channel: ChannelWeek; reason: string } | null;
  };
  completeness: Completeness;
  topVideos: TopVideo[];
};

export type WeekInputs = {
  weekStart: DateStr;
  todayKst: DateStr;
  channels: ChannelMeta[];
  /** Daily rows covering at least [weekStart - 7, weekEnd]. */
  daily: DailyRow[];
  uploadsThisWeek: Map<string, number>;
  uploadsLastWeek: Map<string, number>;
  bestVideos: Map<string, TopVideo>;
  topVideos: TopVideo[];
  snapshots: Snapshot[];
};

const zero = (): Totals => ({ views: 0, watchHours: 0, subscribersGained: 0 });

function add(t: Totals, r: DailyRow) {
  t.views += r.views;
  t.watchHours += r.watchMinutes / 60;
  t.subscribersGained += r.subscribersGained;
}

export function growth(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}

export function trendStatus(daysAvailable: number, growthPct: number | null, comparableViews: number): TrendStatus {
  if (daysAvailable === 0) return "no-data";
  if (growthPct === null) return comparableViews > 0 ? "new" : "stable";
  if (growthPct >= GROWTH_THRESHOLD_PCT) return "growing";
  if (growthPct <= -GROWTH_THRESHOLD_PCT) return "declining";
  return "stable";
}

export function summarizeWeek(input: WeekInputs): WeekSummary {
  const { weekStart } = input;
  const weekEnd = weekEndOf(weekStart);
  const prevStart = addDays(weekStart, -7);
  const byChannel = new Map<string, Map<DateStr, DailyRow>>();
  for (const r of input.daily) {
    if (!byChannel.has(r.channelId)) byChannel.set(r.channelId, new Map());
    byChannel.get(r.channelId)!.set(r.day, r);
  }
  const snaps = new Map(input.snapshots.map((s) => [s.channelId, s]));
  const days = datesBetween(weekStart, weekEnd);

  const channels: ChannelWeek[] = input.channels.map((channel) => {
    const rows = byChannel.get(channel.id) ?? new Map<DateStr, DailyRow>();
    const thisWeek = zero();
    const lastSame = zero();
    const lastFull = zero();
    const cmpThis = zero();
    const cmpLast = zero();
    let subsLost = 0;
    let daysAvailable = 0;
    let lastDays = 0;
    let cmpDays = 0;
    days.forEach((day, i) => {
      const cur = rows.get(day);
      const prev = rows.get(addDays(prevStart, i));
      if (prev) {
        add(lastFull, prev);
        lastDays++;
      }
      if (!cur) return;
      daysAvailable++;
      add(thisWeek, cur);
      subsLost += cur.subscribersLost;
      if (prev) {
        add(lastSame, prev);
        add(cmpThis, cur);
        add(cmpLast, prev);
        cmpDays++;
      }
    });
    const growthPct = growth(cmpThis.views, cmpLast.views);
    const snap = snaps.get(channel.id);
    return {
      channel,
      daysAvailable,
      views: thisWeek.views,
      watchHours: thisWeek.watchHours,
      subscribersGained: thisWeek.subscribersGained,
      subscribersLost: subsLost,
      lastSameDays: lastSame,
      lastFullWeek: { ...lastFull, daysAvailable: lastDays },
      comparable: { this: cmpThis, last: cmpLast, days: cmpDays },
      growthPct,
      uploads: input.uploadsThisWeek.get(channel.id) ?? 0,
      uploadsLast: input.uploadsLastWeek.get(channel.id) ?? 0,
      bestVideo: input.bestVideos.get(channel.id) ?? null,
      status: trendStatus(daysAvailable, growthPct, cmpThis.views),
      lifetime: {
        views: snap?.viewCount ?? null,
        subscribers: snap?.subscriberCount ?? null,
        hiddenSubscribers: snap?.hiddenSubscriberCount ?? false,
      },
    };
  });

  channels.sort((a, b) => b.views - a.views || a.channel.title.localeCompare(b.channel.title));

  const sum = (f: (c: ChannelWeek) => number) => channels.reduce((s, c) => s + f(c), 0);
  const cmpThisViews = sum((c) => c.comparable.this.views);
  const cmpLastViews = sum((c) => c.comparable.last.views);
  const withSnap = channels.filter((c) => c.lifetime.views !== null);
  const withSubs = channels.filter((c) => c.lifetime.subscribers !== null);

  const totals: WeekSummary["totals"] = {
    views: sum((c) => c.views),
    watchHours: sum((c) => c.watchHours),
    subscribersGained: sum((c) => c.subscribersGained),
    subscribersLost: sum((c) => c.subscribersLost),
    uploads: sum((c) => c.uploads),
    uploadsLast: sum((c) => c.uploadsLast),
    lastSameDays: {
      views: sum((c) => c.lastSameDays.views),
      watchHours: sum((c) => c.lastSameDays.watchHours),
      subscribersGained: sum((c) => c.lastSameDays.subscribersGained),
    },
    growthPct: growth(cmpThisViews, cmpLastViews),
    subscribersGrowthPct: growth(sum((c) => c.comparable.this.subscribersGained), sum((c) => c.comparable.last.subscribersGained)),
    watchHoursGrowthPct: growth(sum((c) => c.comparable.this.watchHours), sum((c) => c.comparable.last.watchHours)),
    lifetimeViews: withSnap.length ? withSnap.reduce((s, c) => s + (c.lifetime.views ?? 0), 0) : null,
    lifetimeSubscribers: withSubs.length ? withSubs.reduce((s, c) => s + (c.lifetime.subscribers ?? 0), 0) : null,
    channelsWithHiddenSubscribers: channels.filter((c) => c.lifetime.hiddenSubscribers).length,
  };

  return {
    weekStart,
    weekEnd,
    label: formatWeek(weekStart),
    channels,
    totals,
    highlights: pickHighlights(channels, input.topVideos),
    completeness: completeness(weekStart, input.todayKst, channels),
    topVideos: input.topVideos,
  };
}

function maxBy<T>(items: T[], f: (t: T) => number): T | null {
  let best: T | null = null;
  for (const it of items) if (best === null || f(it) > f(best)) best = it;
  return best;
}

export function pickHighlights(channels: ChannelWeek[], topVideos: TopVideo[]): WeekSummary["highlights"] {
  const comparable = channels.filter((c) => c.growthPct !== null);
  const solid = comparable.filter((c) => c.comparable.last.views >= MIN_BASE_VIEWS);
  const pool = solid.length ? solid : comparable;

  const up = maxBy(pool, (c) => c.growthPct!);
  const down = maxBy(pool, (c) => -c.growthPct!);
  const highestViewed = maxBy(channels.filter((c) => c.views > 0), (c) => c.views);
  const mostSubscribers = maxBy(channels.filter((c) => c.subscribersGained > 0), (c) => c.subscribersGained);
  const biggestDecline = down && down.growthPct! < 0 ? down : null;

  let needsAttention: WeekSummary["highlights"]["needsAttention"] = null;
  const disconnected = channels.find((c) => c.channel.status === "needs_reauth");
  const erroring = channels.find((c) => c.channel.status === "error");
  if (disconnected) {
    needsAttention = { channel: disconnected, reason: "Disconnected from Google — reconnect it so its data is collected again." };
  } else if (erroring) {
    needsAttention = { channel: erroring, reason: `Last sync failed: ${erroring.channel.lastError ?? "unknown error"}` };
  } else if (biggestDecline && biggestDecline.growthPct! <= -GROWTH_THRESHOLD_PCT) {
    needsAttention = { channel: biggestDecline, reason: `Views down ${Math.abs(biggestDecline.growthPct!).toFixed(0)}% versus last week.` };
  } else {
    const stalled = channels.find((c) => c.uploads === 0 && c.uploadsLast > 0);
    if (stalled) needsAttention = { channel: stalled, reason: `No new videos this week (published ${stalled.uploadsLast} last week).` };
  }

  return {
    fastestGrowing: up && up.growthPct! > 0 ? up : null,
    biggestDecline,
    highestViewed,
    mostSubscribers,
    bestVideo: topVideos[0] ?? null,
    needsAttention,
  };
}

export function completeness(weekStart: DateStr, todayKst: DateStr, channels: ChannelWeek[]): Completeness {
  const weekEnd = weekEndOf(weekStart);
  const inProgress = todayKst <= weekEnd;
  const daysElapsed = inProgress ? Math.max(0, Math.min(7, diffDays(todayKst, weekStart) + 1)) : 7;
  const tracked = channels.filter((c) => c.channel.status !== "needs_reauth" || c.daysAvailable > 0);
  const counts = tracked.map((c) => c.daysAvailable);
  const minDays = counts.length ? Math.min(...counts) : 0;
  const maxDays = counts.length ? Math.max(...counts) : 0;
  const complete = counts.length > 0 && minDays === 7;
  const dataThrough = maxDays > 0 ? addDays(weekStart, maxDays - 1) : null;

  let note: string | null = null;
  if (!counts.length) {
    note = null;
  } else if (maxDays === 0) {
    note = "YouTube hasn't published any data for this week yet (it arrives with a 2–3 day delay).";
  } else if (!complete) {
    const coverage = minDays === maxDays ? `${maxDays} of 7 days` : `${minDays}–${maxDays} of 7 days, depending on the channel`;
    const through = dataThrough ? ` through ${formatDay(dataThrough)}` : "";
    note = `${inProgress ? "Week in progress. " : ""}YouTube has published data${through} (${coverage}). ` +
      "Growth compares the same days of last week, and the remaining days usually appear within 2–3 days.";
  }
  return { daysElapsed, minDays, maxDays, complete, inProgress, dataThrough, note };
}

export type WeeklyPoint = {
  weekStart: DateStr;
  label: string;
  views: number;
  watchHours: number;
  subscribersGained: number;
  days: number;
  partial: boolean;
};

/** Weekly totals across the given channels, oldest first. A week is `partial` if any channel lacks days. */
export function weeklySeries(daily: DailyRow[], channelIds: string[], firstWeek: DateStr, lastWeek: DateStr): WeeklyPoint[] {
  const ids = new Set(channelIds);
  const points: WeeklyPoint[] = [];
  const index = new Map<string, DailyRow>();
  for (const r of daily) if (ids.has(r.channelId)) index.set(`${r.channelId}|${r.day}`, r);
  for (let w = firstWeek; w <= lastWeek; w = addDays(w, 7)) {
    const t = zero();
    let minDays = 7;
    let maxDays = 0;
    for (const id of ids) {
      let n = 0;
      for (const d of datesBetween(w, weekEndOf(w))) {
        const r = index.get(`${id}|${d}`);
        if (r) {
          add(t, r);
          n++;
        }
      }
      minDays = Math.min(minDays, n);
      maxDays = Math.max(maxDays, n);
    }
    points.push({
      weekStart: w,
      label: formatDay(w).replace(/^\w+, /, ""),
      views: t.views,
      watchHours: t.watchHours,
      subscribersGained: t.subscribersGained,
      days: maxDays,
      partial: ids.size > 0 && minDays < 7,
    });
  }
  // Drop weeks with no published data at either end (before history starts / not yet published).
  // Plotting them as 0 would invent a collapse that didn't happen.
  while (points.length && points[0].days === 0) points.shift();
  while (points.length && points[points.length - 1].days === 0) points.pop();
  return points;
}
