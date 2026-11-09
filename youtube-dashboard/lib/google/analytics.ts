import { endpoints } from "./oauth";
import { googleRequest, type HttpOptions } from "./http";
import type { QuotaMeter } from "./youtube";

/**
 * YouTube Analytics API v2 (reports.query) for the channel the token belongs to.
 * Days in these reports are Pacific-time calendar days, as in YouTube Studio.
 */

type ReportResponse = {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
};

export type DailyMetrics = {
  day: string;
  views: number;
  watchMinutes: number;
  subscribersGained: number;
  subscribersLost: number;
};

export type VideoMetrics = {
  videoId: string;
  views: number;
  watchMinutes: number;
  averageViewDurationSeconds: number | null;
};

function rowsAsObjects(res: ReportResponse): Record<string, string | number>[] {
  const headers = (res.columnHeaders ?? []).map((h) => h.name);
  return (res.rows ?? []).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}

async function query(accessToken: string, params: Record<string, string>, meter: QuotaMeter, http?: HttpOptions) {
  const qs = new URLSearchParams({ ids: "channel==MINE", ...params });
  await meter("analytics", 1);
  return googleRequest<ReportResponse>(`${endpoints().analytics}/reports?${qs}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  }, http);
}

export async function getDailyMetrics(
  accessToken: string,
  startDate: string,
  endDate: string,
  meter: QuotaMeter,
  http?: HttpOptions,
): Promise<DailyMetrics[]> {
  const res = await query(
    accessToken,
    {
      startDate,
      endDate,
      metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost",
      dimensions: "day",
      sort: "day",
    },
    meter,
    http,
  );
  return rowsAsObjects(res).map((r) => ({
    day: String(r.day),
    views: Number(r.views ?? 0),
    watchMinutes: Number(r.estimatedMinutesWatched ?? 0),
    subscribersGained: Number(r.subscribersGained ?? 0),
    subscribersLost: Number(r.subscribersLost ?? 0),
  }));
}

export async function getTopVideos(
  accessToken: string,
  startDate: string,
  endDate: string,
  meter: QuotaMeter,
  http?: HttpOptions,
  maxResults = 10,
): Promise<VideoMetrics[]> {
  const res = await query(
    accessToken,
    {
      startDate,
      endDate,
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      dimensions: "video",
      sort: "-views",
      maxResults: String(maxResults),
    },
    meter,
    http,
  );
  return rowsAsObjects(res).map((r) => ({
    videoId: String(r.video),
    views: Number(r.views ?? 0),
    watchMinutes: Number(r.estimatedMinutesWatched ?? 0),
    averageViewDurationSeconds: r.averageViewDuration === undefined ? null : Number(r.averageViewDuration),
  }));
}
