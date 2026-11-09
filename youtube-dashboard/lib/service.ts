import type { Sql } from "./db";
import { env } from "./env";
import * as repo from "./repo";
import { summarizeWeek, weeklySeries, type ChannelMeta, type WeekSummary, type WeeklyPoint } from "./metrics";
import { buildReport, renderMarkdown, type WeeklyReport } from "./report";
import { syncAll, type SyncDeps } from "./sync";
import { addDays, kstDate, kstMidnightUtc, weekEndOf, type DateStr } from "./time";

export function syncDepsFor(sql: Sql, now = new Date()): SyncDeps {
  const e = env();
  return { sql, now, clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, encryptionKey: e.TOKEN_ENCRYPTION_KEY };
}

function toMeta(c: repo.ChannelRow): ChannelMeta {
  return {
    id: c.id,
    title: c.title,
    thumbnailUrl: c.thumbnailUrl,
    customUrl: c.customUrl,
    status: c.status,
    lastError: c.lastError,
    dataThrough: c.dataThrough,
  };
}

/** Builds the summary for one KST week, optionally limited to some channels. */
export async function loadWeekSummary(
  sql: Sql,
  args: { weekStart: DateStr; now: Date; channelIds?: string[] | null; topVideoLimit?: number },
): Promise<{ summary: WeekSummary; channels: repo.ChannelRow[] }> {
  const all = await repo.listChannels(sql);
  const selected = args.channelIds?.length ? all.filter((c) => args.channelIds!.includes(c.id)) : all;
  const ids = selected.map((c) => c.id);
  const { weekStart } = args;
  const weekEnd = weekEndOf(weekStart);
  const prev = addDays(weekStart, -7);
  const [daily, upThis, upLast, best, top, snaps] = await Promise.all([
    repo.getDailyStats(sql, ids, prev, weekEnd),
    repo.uploadCounts(sql, ids, kstMidnightUtc(weekStart), kstMidnightUtc(addDays(weekStart, 7))),
    repo.uploadCounts(sql, ids, kstMidnightUtc(prev), kstMidnightUtc(weekStart)),
    repo.bestVideoPerChannel(sql, weekStart, ids),
    repo.topVideosForWeek(sql, weekStart, ids, args.topVideoLimit ?? 10),
    // Lifetime counters are "as of today" figures, so always use the newest snapshot.
    repo.latestSnapshots(sql, ids, kstDate(args.now)),
  ]);
  const summary = summarizeWeek({
    weekStart,
    todayKst: kstDate(args.now),
    channels: selected.map(toMeta),
    daily,
    uploadsThisWeek: upThis,
    uploadsLastWeek: upLast,
    bestVideos: best,
    topVideos: top,
    snapshots: snaps,
  });
  return { summary, channels: all };
}

export async function loadSeries(sql: Sql, channelIds: string[], lastWeek: DateStr, weeks: number): Promise<WeeklyPoint[]> {
  const first = addDays(lastWeek, -7 * (weeks - 1));
  const daily = await repo.getDailyStats(sql, channelIds, first, weekEndOf(lastWeek));
  return weeklySeries(daily, channelIds, first, lastWeek);
}

export async function generateAndStoreReport(
  sql: Sql,
  args: { weekStart: DateStr; trigger: string; now: Date },
): Promise<{ report: WeeklyReport; markdown: string }> {
  const { summary } = await loadWeekSummary(sql, { weekStart: args.weekStart, now: args.now });
  const report = buildReport(summary, args.now);
  const markdown = renderMarkdown(report, { dashboardUrl: env().APP_URL });
  await repo.saveReport(sql, args.weekStart, args.trigger, report, markdown);
  return { report, markdown };
}

export async function syncEverything(sql: Sql, trigger: string, timeBudgetMs?: number) {
  return syncAll(syncDepsFor(sql), { trigger, timeBudgetMs });
}
