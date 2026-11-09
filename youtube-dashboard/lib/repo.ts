import type { Sql } from "./db";
import type { DateStr } from "./time";

/** All database reads/writes. Every write is an upsert keyed on natural keys, so re-syncing never duplicates. */

export type ChannelStatus = "active" | "needs_reauth" | "error";

export type ChannelRow = {
  id: string;
  title: string;
  customUrl: string | null;
  thumbnailUrl: string | null;
  uploadsPlaylistId: string | null;
  googleEmail: string | null;
  status: ChannelStatus;
  lastError: string | null;
  dataThrough: DateStr | null;
  lastSyncedAt: Date | null;
  connectedAt: Date;
};

export type ChannelWithToken = ChannelRow & { refreshTokenEnc: string | null };

const CHANNEL_COLS = `id, title, custom_url as "customUrl", thumbnail_url as "thumbnailUrl",
  uploads_playlist_id as "uploadsPlaylistId", google_email as "googleEmail", status,
  last_error as "lastError", data_through as "dataThrough", last_synced_at as "lastSyncedAt",
  connected_at as "connectedAt"`;

export async function upsertChannel(
  sql: Sql,
  c: {
    id: string;
    title: string;
    customUrl: string | null;
    thumbnailUrl: string | null;
    uploadsPlaylistId: string | null;
    googleEmail: string | null;
    refreshTokenEnc: string;
    scopes: string;
  },
): Promise<{ isNew: boolean }> {
  const [row] = await sql<{ isNew: boolean }[]>`
    insert into channels (id, title, custom_url, thumbnail_url, uploads_playlist_id, google_email, refresh_token_enc, scopes)
    values (${c.id}, ${c.title}, ${c.customUrl}, ${c.thumbnailUrl}, ${c.uploadsPlaylistId}, ${c.googleEmail}, ${c.refreshTokenEnc}, ${c.scopes})
    on conflict (id) do update set
      title = excluded.title, custom_url = excluded.custom_url, thumbnail_url = excluded.thumbnail_url,
      uploads_playlist_id = excluded.uploads_playlist_id, google_email = excluded.google_email,
      refresh_token_enc = excluded.refresh_token_enc, scopes = excluded.scopes,
      status = 'active', last_error = null, updated_at = now()
    returning (xmax = 0) as "isNew"`;
  return row;
}

export async function updateChannelProfile(
  sql: Sql,
  id: string,
  p: { title: string; customUrl: string | null; thumbnailUrl: string | null; uploadsPlaylistId: string | null },
) {
  await sql`update channels set title = ${p.title}, custom_url = ${p.customUrl}, thumbnail_url = ${p.thumbnailUrl},
    uploads_playlist_id = ${p.uploadsPlaylistId}, updated_at = now() where id = ${id}`;
}

export async function listChannels(sql: Sql): Promise<ChannelRow[]> {
  return sql.unsafe<ChannelRow[]>(`select ${CHANNEL_COLS} from channels order by lower(title)`);
}

export async function listChannelsForSync(sql: Sql): Promise<ChannelWithToken[]> {
  return sql.unsafe<ChannelWithToken[]>(
    `select ${CHANNEL_COLS}, refresh_token_enc as "refreshTokenEnc" from channels
     where status <> 'needs_reauth' and refresh_token_enc is not null
     order by last_synced_at asc nulls first`,
  );
}

export async function getChannelForSync(sql: Sql, id: string): Promise<ChannelWithToken | null> {
  const rows = await sql.unsafe<ChannelWithToken[]>(
    `select ${CHANNEL_COLS}, refresh_token_enc as "refreshTokenEnc" from channels where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function setChannelStatus(sql: Sql, id: string, status: ChannelStatus, error: string | null) {
  await sql`update channels set status = ${status}, last_error = ${error}, updated_at = now() where id = ${id}`;
}

export async function markChannelSynced(sql: Sql, id: string, dataThrough: DateStr | null) {
  await sql`update channels set status = 'active', last_error = null, last_synced_at = now(),
    data_through = case when ${dataThrough}::date is null then data_through
                        else greatest(coalesce(data_through, ${dataThrough}::date), ${dataThrough}::date) end,
    updated_at = now() where id = ${id}`;
}

/** Deletes the channel and (via cascade) all of its stored statistics. Returns the encrypted token for revocation. */
export async function deleteChannel(sql: Sql, id: string): Promise<string | null> {
  const rows = await sql<{ token: string | null }[]>`delete from channels where id = ${id} returning refresh_token_enc as token`;
  return rows[0]?.token ?? null;
}

export type DailyRow = {
  channelId: string;
  day: DateStr;
  views: number;
  watchMinutes: number;
  subscribersGained: number;
  subscribersLost: number;
};

export async function upsertDailyStats(sql: Sql, rows: DailyRow[]) {
  if (!rows.length) return;
  const values = rows.map((r) => ({
    channel_id: r.channelId,
    day: r.day,
    views: r.views,
    watch_minutes: r.watchMinutes,
    subscribers_gained: r.subscribersGained,
    subscribers_lost: r.subscribersLost,
  }));
  await sql`insert into channel_daily_stats ${sql(values, "channel_id", "day", "views", "watch_minutes", "subscribers_gained", "subscribers_lost")}
    on conflict (channel_id, day) do update set views = excluded.views, watch_minutes = excluded.watch_minutes,
      subscribers_gained = excluded.subscribers_gained, subscribers_lost = excluded.subscribers_lost, fetched_at = now()`;
}

export async function getDailyStats(sql: Sql, channelIds: string[], from: DateStr, to: DateStr): Promise<DailyRow[]> {
  if (!channelIds.length) return [];
  const rows = await sql<DailyRow[]>`
    select channel_id as "channelId", day, views::float8 as views, watch_minutes as "watchMinutes",
      subscribers_gained as "subscribersGained", subscribers_lost as "subscribersLost"
    from channel_daily_stats where channel_id = any(${channelIds}) and day between ${from} and ${to}
    order by day`;
  return rows.map((r) => ({ ...r, views: Number(r.views) }));
}

export async function earliestStatDay(sql: Sql): Promise<DateStr | null> {
  const [row] = await sql<{ d: DateStr | null }[]>`select min(day) as d from channel_daily_stats`;
  return row?.d ?? null;
}

export type Snapshot = {
  channelId: string;
  snapshotDate: DateStr;
  viewCount: number | null;
  subscriberCount: number | null;
  hiddenSubscriberCount: boolean;
  videoCount: number | null;
};

export async function upsertSnapshot(sql: Sql, s: Snapshot) {
  await sql`insert into channel_snapshots (channel_id, snapshot_date, view_count, subscriber_count, hidden_subscriber_count, video_count)
    values (${s.channelId}, ${s.snapshotDate}, ${s.viewCount}, ${s.subscriberCount}, ${s.hiddenSubscriberCount}, ${s.videoCount})
    on conflict (channel_id, snapshot_date) do update set view_count = excluded.view_count,
      subscriber_count = excluded.subscriber_count, hidden_subscriber_count = excluded.hidden_subscriber_count,
      video_count = excluded.video_count, captured_at = now()`;
}

/** Latest snapshot on or before `onOrBefore` for each channel. */
export async function latestSnapshots(sql: Sql, channelIds: string[], onOrBefore: DateStr): Promise<Snapshot[]> {
  if (!channelIds.length) return [];
  const rows = await sql<Snapshot[]>`
    select distinct on (channel_id) channel_id as "channelId", snapshot_date as "snapshotDate",
      view_count::float8 as "viewCount", subscriber_count::float8 as "subscriberCount",
      hidden_subscriber_count as "hiddenSubscriberCount", video_count as "videoCount"
    from channel_snapshots where channel_id = any(${channelIds}) and snapshot_date <= ${onOrBefore}
    order by channel_id, snapshot_date desc`;
  return rows.map((r) => ({
    ...r,
    viewCount: r.viewCount === null ? null : Number(r.viewCount),
    subscriberCount: r.subscriberCount === null ? null : Number(r.subscriberCount),
  }));
}

export type VideoRow = { id: string; channelId: string; title: string; thumbnailUrl: string | null; publishedAt: string | null };

export async function upsertVideos(sql: Sql, videos: VideoRow[]) {
  if (!videos.length) return;
  const seen = new Map(videos.map((v) => [v.id, v]));
  const values = [...seen.values()].map((v) => ({
    id: v.id,
    channel_id: v.channelId,
    title: v.title,
    thumbnail_url: v.thumbnailUrl,
    published_at: v.publishedAt,
  }));
  await sql`insert into videos ${sql(values, "id", "channel_id", "title", "thumbnail_url", "published_at")}
    on conflict (id) do update set title = excluded.title, thumbnail_url = excluded.thumbnail_url,
      published_at = coalesce(excluded.published_at, videos.published_at), updated_at = now()`;
}

export async function knownVideoIds(sql: Sql, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await sql<{ id: string }[]>`select id from videos where id = any(${ids})`;
  return new Set(rows.map((r) => r.id));
}

/** Count of public uploads per channel published in [fromUtc, toUtc). */
export async function uploadCounts(sql: Sql, channelIds: string[], fromUtc: Date, toUtc: Date): Promise<Map<string, number>> {
  if (!channelIds.length) return new Map();
  const rows = await sql<{ channelId: string; n: number }[]>`
    select channel_id as "channelId", count(*)::int as n from videos
    where channel_id = any(${channelIds}) and published_at >= ${fromUtc} and published_at < ${toUtc}
    group by channel_id`;
  return new Map(rows.map((r) => [r.channelId, r.n]));
}

export type WeeklyVideoStat = {
  weekStart: DateStr;
  videoId: string;
  channelId: string;
  views: number;
  watchMinutes: number;
  averageViewDurationSeconds: number | null;
};

export async function replaceWeeklyVideoStats(sql: Sql, channelId: string, weekStart: DateStr, rows: WeeklyVideoStat[]) {
  await sql.begin(async (tx) => {
    // The top-N list can change as the week fills in; replace this channel's slice atomically.
    await tx`delete from weekly_video_stats where channel_id = ${channelId} and week_start = ${weekStart}`;
    if (!rows.length) return;
    const values = rows.map((r) => ({
      week_start: r.weekStart,
      video_id: r.videoId,
      channel_id: r.channelId,
      views: r.views,
      watch_minutes: r.watchMinutes,
      average_view_duration_seconds: r.averageViewDurationSeconds,
    }));
    await tx`insert into weekly_video_stats ${tx(values, "week_start", "video_id", "channel_id", "views", "watch_minutes", "average_view_duration_seconds")}
      on conflict (week_start, video_id) do update set views = excluded.views, watch_minutes = excluded.watch_minutes,
        average_view_duration_seconds = excluded.average_view_duration_seconds, fetched_at = now()`;
  });
}

export type TopVideo = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  views: number;
  watchMinutes: number;
  averageViewDurationSeconds: number | null;
};

export async function topVideosForWeek(sql: Sql, weekStart: DateStr, channelIds: string[], limit = 10): Promise<TopVideo[]> {
  if (!channelIds.length) return [];
  const rows = await sql<TopVideo[]>`
    select s.video_id as "videoId", s.channel_id as "channelId", c.title as "channelTitle", v.title,
      v.thumbnail_url as "thumbnailUrl", v.published_at as "publishedAt", s.views::float8 as views,
      s.watch_minutes as "watchMinutes", s.average_view_duration_seconds as "averageViewDurationSeconds"
    from weekly_video_stats s join videos v on v.id = s.video_id join channels c on c.id = s.channel_id
    where s.week_start = ${weekStart} and s.channel_id = any(${channelIds})
    order by s.views desc, s.video_id limit ${limit}`;
  return rows.map(normaliseTopVideo);
}

export async function bestVideoPerChannel(sql: Sql, weekStart: DateStr, channelIds: string[]): Promise<Map<string, TopVideo>> {
  if (!channelIds.length) return new Map();
  const rows = await sql<TopVideo[]>`
    select distinct on (s.channel_id) s.video_id as "videoId", s.channel_id as "channelId", c.title as "channelTitle",
      v.title, v.thumbnail_url as "thumbnailUrl", v.published_at as "publishedAt", s.views::float8 as views,
      s.watch_minutes as "watchMinutes", s.average_view_duration_seconds as "averageViewDurationSeconds"
    from weekly_video_stats s join videos v on v.id = s.video_id join channels c on c.id = s.channel_id
    where s.week_start = ${weekStart} and s.channel_id = any(${channelIds})
    order by s.channel_id, s.views desc, s.video_id`;
  return new Map(rows.map((r) => [r.channelId, normaliseTopVideo(r)]));
}

function normaliseTopVideo(r: TopVideo): TopVideo {
  const published = r.publishedAt as unknown;
  return {
    ...r,
    views: Number(r.views),
    publishedAt: published instanceof Date ? published.toISOString() : (r.publishedAt ?? null),
  };
}

export type StoredReport = { weekStart: DateStr; generatedAt: Date; trigger: string; reportJson: unknown; markdown: string };

export async function saveReport(sql: Sql, weekStart: DateStr, trigger: string, reportJson: unknown, markdown: string) {
  await sql`insert into weekly_reports (week_start, trigger, report_json, markdown)
    values (${weekStart}, ${trigger}, ${sql.json(reportJson as Parameters<typeof sql.json>[0])}, ${markdown})
    on conflict (week_start) do update set trigger = excluded.trigger, report_json = excluded.report_json,
      markdown = excluded.markdown, generated_at = now()`;
}

export async function getReport(sql: Sql, weekStart: DateStr): Promise<StoredReport | null> {
  const rows = await sql<StoredReport[]>`select week_start as "weekStart", generated_at as "generatedAt", trigger,
    report_json as "reportJson", markdown from weekly_reports where week_start = ${weekStart}`;
  return rows[0] ?? null;
}

export async function listReports(sql: Sql): Promise<Omit<StoredReport, "reportJson" | "markdown">[]> {
  return sql`select week_start as "weekStart", generated_at as "generatedAt", trigger from weekly_reports order by week_start desc limit 104`;
}

export async function startSyncRun(sql: Sql, trigger: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`insert into sync_runs (trigger) values (${trigger}) returning id`;
  return Number(row.id);
}

export async function finishSyncRun(
  sql: Sql,
  id: number,
  r: { status: "success" | "partial" | "failed"; ok: number; failed: number; details: unknown },
) {
  await sql`update sync_runs set finished_at = now(), status = ${r.status}, channels_ok = ${r.ok},
    channels_failed = ${r.failed}, details = ${sql.json(r.details as Parameters<typeof sql.json>[0])} where id = ${id}`;
}

export type SyncRunRow = { id: number; trigger: string; startedAt: Date; finishedAt: Date | null; status: string; channelsOk: number; channelsFailed: number };

export async function latestSyncRun(sql: Sql): Promise<SyncRunRow | null> {
  const rows = await sql<SyncRunRow[]>`select id, trigger, started_at as "startedAt", finished_at as "finishedAt", status,
    channels_ok as "channelsOk", channels_failed as "channelsFailed" from sync_runs order by id desc limit 1`;
  return rows[0] ?? null;
}

/** Marks runs abandoned by a crashed/timed-out function as failed so they don't look "running" forever. */
export async function expireStaleRuns(sql: Sql) {
  await sql`update sync_runs set status = 'failed', finished_at = now(), details = '{"error":"timed out"}'::jsonb
    where status = 'running' and started_at < now() - interval '15 minutes'`;
}

export async function addQuotaUsage(sql: Sql, day: DateStr, api: "data" | "analytics", units: number) {
  await sql`insert into api_quota_usage (day, api, units) values (${day}, ${api}, ${units})
    on conflict (day, api) do update set units = api_quota_usage.units + excluded.units`;
}

export async function getQuotaUsage(sql: Sql, day: DateStr): Promise<{ data: number; analytics: number }> {
  const rows = await sql<{ api: "data" | "analytics"; units: number }[]>`select api, units from api_quota_usage where day = ${day}`;
  const out = { data: 0, analytics: 0 };
  for (const r of rows) out[r.api] = r.units;
  return out;
}
