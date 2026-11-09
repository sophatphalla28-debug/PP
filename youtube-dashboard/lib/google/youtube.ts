import { endpoints } from "./oauth";
import { GoogleApiError, googleRequest, type HttpOptions } from "./http";

/** YouTube Data API v3 calls. Each list call costs 1 quota unit. */

type Thumbs = Record<string, { url: string; width?: number; height?: number } | undefined>;

export type ChannelResource = {
  id: string;
  snippet: { title: string; customUrl?: string; thumbnails?: Thumbs };
  statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

export type ChannelInfo = {
  id: string;
  title: string;
  customUrl: string | null;
  thumbnailUrl: string | null;
  uploadsPlaylistId: string | null;
  viewCount: number | null;
  subscriberCount: number | null;
  hiddenSubscriberCount: boolean;
  videoCount: number | null;
};

export type UploadItem = { videoId: string; title: string; thumbnailUrl: string | null; publishedAt: string };
export type VideoInfo = { id: string; channelId: string; title: string; thumbnailUrl: string | null; publishedAt: string | null };

export type QuotaMeter = (api: "data" | "analytics", units: number) => void | Promise<void>;

function pickThumb(t?: Thumbs): string | null {
  return t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? null;
}

const num = (s?: string) => (s === undefined ? null : Number(s));

function auth(accessToken: string): RequestInit {
  return { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } };
}

export function toChannelInfo(c: ChannelResource): ChannelInfo {
  return {
    id: c.id,
    title: c.snippet.title,
    customUrl: c.snippet.customUrl ?? null,
    thumbnailUrl: pickThumb(c.snippet.thumbnails),
    uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? null,
    viewCount: num(c.statistics?.viewCount),
    subscriberCount: c.statistics?.hiddenSubscriberCount ? null : num(c.statistics?.subscriberCount),
    hiddenSubscriberCount: Boolean(c.statistics?.hiddenSubscriberCount),
    videoCount: num(c.statistics?.videoCount),
  };
}

/** The channel the access token belongs to (the account / Brand Account picked at consent). */
export async function getMyChannels(accessToken: string, meter: QuotaMeter, http?: HttpOptions): Promise<ChannelInfo[]> {
  const url = `${endpoints().youtube}/channels?part=snippet,statistics,contentDetails&mine=true&maxResults=50`;
  await meter("data", 1);
  const res = await googleRequest<{ items?: ChannelResource[] }>(url, auth(accessToken), http);
  return (res.items ?? []).map(toChannelInfo);
}

/** Recent uploads, newest first, until `sinceIso` (stops paging early to save quota). */
export async function listRecentUploads(
  accessToken: string,
  uploadsPlaylistId: string,
  sinceIso: string,
  meter: QuotaMeter,
  http?: HttpOptions,
  maxPages = 4,
): Promise<UploadItem[]> {
  const out: UploadItem[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ part: "snippet,contentDetails", playlistId: uploadsPlaylistId, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    await meter("data", 1);
    let res: {
      nextPageToken?: string;
      items?: {
        snippet: { title: string; thumbnails?: Thumbs; publishedAt: string };
        contentDetails: { videoId: string; videoPublishedAt?: string };
      }[];
    };
    try {
      res = await googleRequest(`${endpoints().youtube}/playlistItems?${params}`, auth(accessToken), http);
    } catch (e) {
      // A channel with no uploads has no uploads playlist.
      if (e instanceof GoogleApiError && e.kind === "not_found") return out;
      throw e;
    }
    let reachedOlder = false;
    for (const item of res.items ?? []) {
      const publishedAt = item.contentDetails.videoPublishedAt;
      if (!publishedAt) continue; // private / scheduled, not yet public
      if (publishedAt < sinceIso) {
        reachedOlder = true;
        continue;
      }
      out.push({
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        thumbnailUrl: pickThumb(item.snippet.thumbnails),
        publishedAt,
      });
    }
    if (reachedOlder || !res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  return out;
}

export async function getVideos(accessToken: string, ids: string[], meter: QuotaMeter, http?: HttpOptions): Promise<VideoInfo[]> {
  const out: VideoInfo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    await meter("data", 1);
    const res = await googleRequest<{
      items?: { id: string; snippet: { channelId: string; title: string; thumbnails?: Thumbs; publishedAt?: string } }[];
    }>(`${endpoints().youtube}/videos?part=snippet&id=${batch.join(",")}&maxResults=50`, auth(accessToken), http);
    for (const v of res.items ?? []) {
      out.push({
        id: v.id,
        channelId: v.snippet.channelId,
        title: v.snippet.title,
        thumbnailUrl: pickThumb(v.snippet.thumbnails),
        publishedAt: v.snippet.publishedAt ?? null,
      });
    }
  }
  return out;
}
