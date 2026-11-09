import type { DailyRow, TopVideo } from "@/lib/repo";
import type { ChannelMeta, WeekInputs } from "@/lib/metrics";
import { addDays, datesBetween } from "@/lib/time";

export function meta(id: string, title = id, extra: Partial<ChannelMeta> = {}): ChannelMeta {
  return { id, title, thumbnailUrl: null, customUrl: null, status: "active", lastError: null, dataThrough: null, ...extra };
}

/** Spreads a weekly total evenly over `days` days starting at `weekStart` (remainder on day 1). */
export function week(channelId: string, weekStart: string, total: number, days = 7, extra: Partial<DailyRow> = {}): DailyRow[] {
  const per = Math.floor(total / 7);
  return datesBetween(weekStart, addDays(weekStart, days - 1)).map((day, i) => ({
    channelId,
    day,
    views: i === 0 ? total - per * 6 : per,
    watchMinutes: (i === 0 ? total - per * 6 : per) * 3,
    subscribersGained: 10,
    subscribersLost: 2,
    ...extra,
  }));
}

export function video(channelId: string, id: string, views: number, title = id): TopVideo {
  return {
    videoId: id,
    channelId,
    channelTitle: channelId,
    title,
    thumbnailUrl: null,
    publishedAt: "2026-11-03T01:00:00Z",
    views,
    watchMinutes: views * 4,
    averageViewDurationSeconds: 245,
  };
}

export function inputs(p: Partial<WeekInputs> & Pick<WeekInputs, "weekStart" | "channels" | "daily">): WeekInputs {
  return {
    todayKst: addDays(p.weekStart, 8),
    uploadsThisWeek: new Map(),
    uploadsLastWeek: new Map(),
    bestVideos: new Map(),
    topVideos: [],
    snapshots: [],
    ...p,
  };
}
