import type { Sql } from "./db";
import { decryptSecret } from "./crypto";
import { GoogleApiError, type HttpOptions } from "./google/http";
import { refreshAccessToken } from "./google/oauth";
import { getMyChannels, getVideos, listRecentUploads, type QuotaMeter } from "./google/youtube";
import { getDailyMetrics, getTopVideos } from "./google/analytics";
import * as repo from "./repo";
import {
  addDays,
  currentWeekStart,
  datesBetween,
  kstDate,
  kstMidnightUtc,
  minDate,
  pacificDate,
  weekEndOf,
  type DateStr,
} from "./time";

/** Weeks of history pulled when a channel is first connected (plus the current week). */
export const HISTORY_WEEKS = 12;
/** Weeks of top-video lists pulled on first connect. */
const TOP_VIDEO_BACKFILL_WEEKS = 4;
/** Stay under the default 10,000-unit/day YouTube Data API quota with a safety margin. */
const DATA_QUOTA_LIMIT = Number(process.env.YOUTUBE_DATA_QUOTA_LIMIT ?? 9500);

export type SyncDeps = {
  sql: Sql;
  now: Date;
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
  http?: HttpOptions;
};

export type ChannelSyncResult = {
  channelId: string;
  title: string;
  ok: boolean;
  error?: string;
  errorKind?: string;
  dataThrough?: DateStr | null;
  quotaUnits: { data: number; analytics: number };
};

export function historyStart(now: Date): DateStr {
  return addDays(currentWeekStart(now), -7 * HISTORY_WEEKS);
}

/** Fill days YouTube skipped (zero activity) between `from` and the latest day it reported. */
export function fillDailyGaps(channelId: string, from: DateStr, rows: { day: DateStr; views: number; watchMinutes: number; subscribersGained: number; subscribersLost: number }[]): { rows: repo.DailyRow[]; latest: DateStr | null } {
  if (!rows.length) return { rows: [], latest: null };
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const latest = rows.reduce((m, r) => (r.day > m ? r.day : m), rows[0].day);
  const start = minDate(from, rows.reduce((m, r) => (r.day < m ? r.day : m), rows[0].day));
  const filled = datesBetween(start, latest).map((day) => {
    const r = byDay.get(day);
    return {
      channelId,
      day,
      views: r?.views ?? 0,
      watchMinutes: r?.watchMinutes ?? 0,
      subscribersGained: r?.subscribersGained ?? 0,
      subscribersLost: r?.subscribersLost ?? 0,
    };
  });
  return { rows: filled, latest };
}

async function makeMeter(sql: Sql, now: Date) {
  const day = pacificDate(now); // YouTube quotas reset at midnight Pacific time
  const used = await repo.getQuotaUsage(sql, day);
  const spent = { data: 0, analytics: 0 };
  const meter: QuotaMeter = (api, units) => {
    if (api === "data" && used.data + spent.data + units > DATA_QUOTA_LIMIT) {
      throw new GoogleApiError(
        `Daily YouTube Data API budget (${DATA_QUOTA_LIMIT} units) reached; sync resumes after midnight Pacific time.`,
        "quota",
        403,
        "localBudget",
      );
    }
    spent[api] += units;
  };
  const flush = async () => {
    if (spent.data) await repo.addQuotaUsage(sql, day, "data", spent.data);
    if (spent.analytics) await repo.addQuotaUsage(sql, day, "analytics", spent.analytics);
    const out = { ...spent };
    spent.data = 0;
    spent.analytics = 0;
    return out;
  };
  return { meter, flush };
}

export async function syncChannel(channel: repo.ChannelWithToken, deps: SyncDeps): Promise<ChannelSyncResult> {
  const { sql, now } = deps;
  const { meter, flush } = await makeMeter(sql, now);
  const base = { channelId: channel.id, title: channel.title };
  try {
    if (!channel.refreshTokenEnc) throw new GoogleApiError("No stored authorization for this channel", "revoked", 401);
    const refreshToken = decryptSecret(channel.refreshTokenEnc, deps.encryptionKey, channel.id);
    const accessToken = await refreshAccessToken(refreshToken, { clientId: deps.clientId, clientSecret: deps.clientSecret }, deps.http);

    // 1. Profile + lifetime counters (Data API, 1 unit)
    const mine = await getMyChannels(accessToken, meter, deps.http);
    const info = mine.find((c) => c.id === channel.id);
    if (!info) {
      throw new GoogleApiError(
        "This Google authorization no longer has access to the channel. Reconnect it and pick the right account.",
        "forbidden",
        403,
        "channelMismatch",
      );
    }
    await repo.updateChannelProfile(sql, channel.id, info);
    await repo.upsertSnapshot(sql, {
      channelId: channel.id,
      snapshotDate: kstDate(now),
      viewCount: info.viewCount,
      subscriberCount: info.subscriberCount,
      hiddenSubscriberCount: info.hiddenSubscriberCount,
      videoCount: info.videoCount,
    });

    // 2. Daily analytics. Re-read recent days every run because YouTube back-fills them over 2–3 days.
    const thisWeek = currentWeekStart(now);
    const today = pacificDate(now);
    const from = channel.dataThrough
      ? minDate(addDays(channel.dataThrough, -6), addDays(thisWeek, -7))
      : historyStart(now);
    let latest: DateStr | null = null;
    if (from <= today) {
      const daily = await getDailyMetrics(accessToken, from, today, meter, deps.http);
      const filled = fillDailyGaps(channel.id, from, daily);
      await repo.upsertDailyStats(sql, filled.rows);
      latest = filled.latest;
    }

    // 3. Uploads published since the start of last week (exact timestamps → exact KST weeks)
    if (info.uploadsPlaylistId) {
      const since = kstMidnightUtc(addDays(thisWeek, -7)).toISOString();
      const uploads = await listRecentUploads(accessToken, info.uploadsPlaylistId, since, meter, deps.http);
      await repo.upsertVideos(
        sql,
        uploads.map((u) => ({ id: u.videoId, channelId: channel.id, title: u.title, thumbnailUrl: u.thumbnailUrl, publishedAt: u.publishedAt })),
      );
    }

    // 4. Top videos for this week and last week (more weeks on first connect)
    const weeks = [thisWeek, addDays(thisWeek, -7)];
    if (!channel.lastSyncedAt) {
      for (let i = 2; i < 2 + TOP_VIDEO_BACKFILL_WEEKS; i++) weeks.push(addDays(thisWeek, -7 * i));
    }
    for (const weekStart of weeks) {
      const end = minDate(weekEndOf(weekStart), today);
      if (weekStart > end) continue; // week hasn't started yet in Pacific time
      const top = await getTopVideos(accessToken, weekStart, end, meter, deps.http);
      const ids = top.map((t) => t.videoId);
      const known = await repo.knownVideoIds(sql, ids);
      const missing = ids.filter((id) => !known.has(id));
      if (missing.length) {
        const meta = await getVideos(accessToken, missing, meter, deps.http);
        await repo.upsertVideos(sql, meta.map((m) => ({ ...m, channelId: channel.id })));
        for (const m of meta) known.add(m.id);
      }
      await repo.replaceWeeklyVideoStats(
        sql,
        channel.id,
        weekStart,
        top.filter((t) => known.has(t.videoId)).map((t) => ({ ...t, weekStart, channelId: channel.id })),
      );
    }

    await repo.markChannelSynced(sql, channel.id, latest);
    return { ...base, ok: true, dataThrough: latest ?? channel.dataThrough, quotaUnits: await flush() };
  } catch (e) {
    const err = e instanceof GoogleApiError ? e : new GoogleApiError((e as Error).message, "transient", 0);
    if (err.kind === "revoked" || err.kind === "forbidden" || err.kind === "auth") {
      await repo.setChannelStatus(sql, channel.id, "needs_reauth", reauthMessage(err));
    } else {
      await repo.setChannelStatus(sql, channel.id, "error", err.message.slice(0, 500));
    }
    return { ...base, ok: false, error: err.message, errorKind: err.kind, quotaUnits: await flush() };
  }
}

function reauthMessage(err: GoogleApiError): string {
  if (err.kind === "revoked") {
    return "Google access expired or was revoked. Reconnect this channel. (If this repeats weekly, set your OAuth app to 'In production'.)";
  }
  return `Google refused access: ${err.message}`.slice(0, 500);
}

export type SyncRunResult = {
  runId: number;
  status: "success" | "partial" | "failed";
  results: ChannelSyncResult[];
  skipped: string[];
  stoppedReason?: string;
};

/** Syncs every connected channel (least recently synced first) within a time budget. */
export async function syncAll(
  deps: SyncDeps,
  opts: { trigger: string; timeBudgetMs?: number; concurrency?: number; onlyChannelId?: string },
): Promise<SyncRunResult> {
  const { sql } = deps;
  await repo.expireStaleRuns(sql);
  const runId = await repo.startSyncRun(sql, opts.trigger);
  const startedAt = Date.now();
  const budget = opts.timeBudgetMs ?? 240_000;
  let channels = await repo.listChannelsForSync(sql);
  if (opts.onlyChannelId) channels = channels.filter((c) => c.id === opts.onlyChannelId);

  const queue = [...channels];
  const results: ChannelSyncResult[] = [];
  let stoppedReason: string | undefined;

  async function worker() {
    for (;;) {
      if (stoppedReason) return;
      if (Date.now() - startedAt > budget) {
        stoppedReason ??= "time budget reached; remaining channels sync on the next run";
        return;
      }
      const channel = queue.shift();
      if (!channel) return;
      const r = await syncChannel(channel, deps);
      results.push(r);
      if (r.errorKind === "quota") stoppedReason = r.error;
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, Math.max(queue.length, 1)) }, worker));

  const failed = results.filter((r) => !r.ok).length;
  const skipped = queue.map((c) => c.title);
  const status: SyncRunResult["status"] =
    failed === 0 && skipped.length === 0 ? "success" : failed === results.length && results.length > 0 ? "failed" : "partial";
  await repo.finishSyncRun(sql, runId, {
    status,
    ok: results.length - failed,
    failed,
    details: { results: results.map(({ channelId, title, ok, error, errorKind }) => ({ channelId, title, ok, error, errorKind })), skipped, stoppedReason },
  });
  return { runId, status, results, skipped, stoppedReason };
}
