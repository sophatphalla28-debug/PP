// TEST FIXTURE ONLY — a fake Google OAuth + YouTube Data/Analytics API used by the automated tests.
// The production app never loads this file; it only talks to it when TEST_ONLY_GOOGLE_MOCK_URL is set
// (ignored on Vercel). All numbers here are synthetic and deterministic.
import { createHash, randomBytes } from "node:crypto";

const DAY = 86_400_000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const parse = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const pacificToday = (now) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export const CHANNELS = {
  alpha: { id: "UCtestAlphaChannel000001", title: "Test Channel Alpha", base: 3000, weekly: 0.12, minutesPerView: 4.1, uploadEveryDays: 2, subs: 48200 },
  beta: { id: "UCtestBetaChannel0000002", title: "Test Channel Beta", base: 7000, weekly: -0.1, minutesPerView: 6.3, uploadEveryDays: 3.5, subs: 152000 },
  gamma: { id: "UCtestGammaChannel000003", title: "Test Channel Gamma", base: 420, weekly: 0, minutesPerView: 2.2, uploadEveryDays: 7, subs: 3900 },
};

export const ACCOUNTS = {
  owner: { email: "owner@example.com", name: "Dashboard Owner", channel: null },
  intruder: { email: "intruder@example.com", name: "Not Allowed", channel: null },
  alpha: { email: "creator.one@example.com", name: "Creator One", channel: "alpha" },
  beta: { email: "creator.one@example.com", name: "Creator One (Brand Account)", channel: "beta" },
  gamma: { email: "creator.two@example.com", name: "Creator Two", channel: "gamma" },
  nochannel: { email: "nochannel@example.com", name: "No Channel", channel: null },
};

const YT = "https://www.googleapis.com/auth/youtube.readonly";
const YTA = "https://www.googleapis.com/auth/yt-analytics.readonly";

/**
 * @param {{ base: string, now?: () => Date, clientId?: string, clientSecret?: string, dataDelayDays?: number, anchorDate?: string }} opts
 */
export function createFakeGoogle({ base, now = () => new Date(), clientId = "test-client", clientSecret = "test-secret", dataDelayDays = 2, anchorDate } = {}) {
  const codes = new Map();
  const accessTokens = new Map(); // token → account key
  const refreshTokens = new Map(); // token → account key (a new one per consent, like Google)
  const state = { revoked: new Set(), revokedCalls: [], quotaExhausted: false, rateLimitNext: 0, calls: [] };

  const todayPt = () => pacificToday(now());
  // Synthetic history is anchored to a fixed day so past numbers never change between calls.
  const anchor = anchorDate ?? todayPt();
  const dataThrough = () => ymd(parse(todayPt()) - dataDelayDays * DAY);

  function dailyViews(key, day) {
    const c = CHANNELS[key];
    const offset = (parse(day) - parse(anchor)) / DAY;
    const dow = new Date(parse(day)).getUTCDay();
    const wave = 1 + 0.12 * Math.sin((dow / 7) * 2 * Math.PI);
    return Math.max(0, Math.round(c.base * Math.pow(1 + c.weekly, offset / 7) * wave));
  }
  function dailyRow(key, day) {
    const v = dailyViews(key, day);
    return { day, views: v, minutes: Math.round(v * CHANNELS[key].minutesPerView), gained: Math.round(v * 0.012), lost: Math.round(v * 0.002) };
  }
  function videos(key) {
    const c = CHANNELS[key];
    const t = now().getTime();
    return Array.from({ length: 15 }, (_, i) => ({
      id: `${key}-vid-${String(i + 1).padStart(2, "0")}`,
      title: `${c.title.replace("Test Channel ", "")} test video #${15 - i}`,
      publishedAt: new Date(t - (i * c.uploadEveryDays + 0.2) * DAY).toISOString().replace(/\.\d+Z$/, "Z"),
      channelId: c.id,
      weight: 1 / Math.pow(i + 1, 1.1),
    }));
  }
  const thumb = (id) => ({ medium: { url: `${base}/thumb/${id}.svg`, width: 320, height: 180 } });

  function json(status, body) {
    return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  }
  function apiError(status, reason, message) {
    return json(status, { error: { code: status, message, errors: [{ reason, message }] } });
  }
  function account(headers) {
    const auth = headers.authorization || headers.Authorization || "";
    return accessTokens.get(auth.replace(/^Bearer\s+/i, "")) ?? null;
  }
  const idToken = (key) => {
    const a = ACCOUNTS[key];
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${enc({ alg: "none" })}.${enc({ iss: base, aud: clientId, sub: `sub-${key}`, email: a.email, email_verified: true, name: a.name, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  };

  function chooserPage(q) {
    const redirect = q.get("redirect_uri");
    const st = q.get("state");
    const scope = q.get("scope") ?? "";
    const challenge = q.get("code_challenge");
    const link = (key, label, granted = scope) => {
      const code = randomBytes(12).toString("hex");
      codes.set(code, { key, scope: granted, challenge, redirect, used: false });
      return `<li><a data-account="${key}" href="${redirect}?code=${code}&state=${encodeURIComponent(st)}">${label}</a></li>`;
    };
    const isConnect = scope.includes(YT);
    const items = isConnect
      ? [
          link("alpha", "Test Channel Alpha (creator.one@example.com)"),
          link("beta", "Test Channel Beta — Brand Account (creator.one@example.com)"),
          link("gamma", "Test Channel Gamma (creator.two@example.com)"),
          link("nochannel", "Account without a channel"),
          `<li><a data-account="alpha-noanalytics" href="${(() => {
            const code = randomBytes(12).toString("hex");
            codes.set(code, { key: "alpha", scope: scope.replace(YTA, "").trim(), challenge, redirect, used: false });
            return `${redirect}?code=${code}&state=${encodeURIComponent(st)}`;
          })()}">Alpha, but untick YouTube Analytics</a></li>`,
        ]
      : [link("owner", "owner@example.com"), link("intruder", "intruder@example.com")];
    const cancel = `<li><a data-account="cancel" href="${redirect}?error=access_denied&state=${encodeURIComponent(st)}">Cancel</a></li>`;
    return {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: `<!doctype html><title>Fake Google sign-in</title><h1>Choose an account (TEST)</h1><p>prompt=${q.get("prompt")} access_type=${q.get("access_type")}</p><ul>${items.join("")}${cancel}</ul>`,
    };
  }

  function newRefreshToken(key) {
    const rt = `rt-${key}-${randomBytes(6).toString("hex")}`;
    refreshTokens.set(rt, key);
    return rt;
  }
  /** For in-process tests: register a known refresh token for an account. */
  function issueRefreshToken(key, rt = `rt-${key}`) {
    refreshTokens.set(rt, key);
    return rt;
  }

  function token(form) {
    if (form.get("client_id") !== clientId || form.get("client_secret") !== clientSecret) return json(401, { error: "invalid_client" });
    if (form.get("grant_type") === "authorization_code") {
      const entry = codes.get(form.get("code"));
      if (!entry || entry.used) return json(400, { error: "invalid_grant", error_description: "Bad code" });
      const challenge = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
      if (challenge !== entry.challenge) return json(400, { error: "invalid_grant", error_description: "PKCE mismatch" });
      if (form.get("redirect_uri") !== entry.redirect) return json(400, { error: "redirect_uri_mismatch" });
      entry.used = true;
      const at = `at-${entry.key}-${randomBytes(6).toString("hex")}`;
      accessTokens.set(at, entry.key);
      const offline = entry.scope.includes(YT);
      return json(200, {
        access_token: at,
        expires_in: 3599,
        token_type: "Bearer",
        scope: entry.scope,
        id_token: idToken(entry.key),
        ...(offline ? { refresh_token: newRefreshToken(entry.key) } : {}),
      });
    }
    if (form.get("grant_type") === "refresh_token") {
      const rt = form.get("refresh_token") ?? "";
      const key = refreshTokens.get(rt);
      if (!key || state.revoked.has(rt)) return json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
      const at = `at-${key}-${randomBytes(6).toString("hex")}`;
      accessTokens.set(at, key);
      return json(200, { access_token: at, expires_in: 3599, token_type: "Bearer", scope: `${YT} ${YTA}` });
    }
    return json(400, { error: "unsupported_grant_type" });
  }

  function youtube(path, q, key) {
    if (state.quotaExhausted) return apiError(403, "quotaExceeded", "The request cannot be completed because you have exceeded your quota.");
    const chKey = ACCOUNTS[key]?.channel;
    if (path === "/youtube/v3/channels") {
      if (!chKey) return json(200, { kind: "youtube#channelListResponse", items: [] });
      const c = CHANNELS[chKey];
      const totalViews = 1_250_000 + c.base * 400;
      return json(200, {
        items: [
          {
            id: c.id,
            snippet: { title: c.title, customUrl: `@${chKey}test`, thumbnails: thumb(`avatar-${chKey}`) },
            statistics: { viewCount: String(totalViews), subscriberCount: String(c.subs), hiddenSubscriberCount: false, videoCount: "15" },
            contentDetails: { relatedPlaylists: { uploads: `UU-${chKey}` } },
          },
        ],
      });
    }
    if (path === "/youtube/v3/playlistItems") {
      const pl = q.get("playlistId") ?? "";
      const owner = pl.replace(/^UU-/, "");
      if (!CHANNELS[owner]) return apiError(404, "playlistNotFound", "Playlist not found");
      return json(200, {
        items: videos(owner).map((v) => ({
          snippet: { title: v.title, thumbnails: thumb(v.id), publishedAt: v.publishedAt },
          contentDetails: { videoId: v.id, videoPublishedAt: v.publishedAt },
        })),
      });
    }
    if (path === "/youtube/v3/videos") {
      const ids = (q.get("id") ?? "").split(",");
      const all = Object.keys(CHANNELS).flatMap(videos);
      return json(200, {
        items: all.filter((v) => ids.includes(v.id)).map((v) => ({ id: v.id, snippet: { channelId: v.channelId, title: v.title, thumbnails: thumb(v.id), publishedAt: v.publishedAt } })),
      });
    }
    return apiError(404, "notFound", "Unknown endpoint");
  }

  function analytics(q, key) {
    if (state.rateLimitNext > 0) {
      state.rateLimitNext--;
      return apiError(429, "rateLimitExceeded", "Too many requests");
    }
    const chKey = ACCOUNTS[key]?.channel;
    if (!chKey) return apiError(403, "forbidden", "No channel");
    if (q.get("ids") !== "channel==MINE") return apiError(400, "badRequest", "ids must be channel==MINE");
    const start = q.get("startDate");
    const end = q.get("endDate") < dataThrough() ? q.get("endDate") : dataThrough();
    const days = [];
    for (let t = parse(start); t <= parse(end); t += DAY) days.push(ymd(t));
    if (q.get("dimensions") === "day") {
      return json(200, {
        columnHeaders: ["day", "views", "estimatedMinutesWatched", "subscribersGained", "subscribersLost"].map((name) => ({ name })),
        rows: days.map((d) => dailyRow(chKey, d)).map((r) => [r.day, r.views, r.minutes, r.gained, r.lost]),
      });
    }
    if (q.get("dimensions") === "video") {
      const total = days.reduce((s, d) => s + dailyViews(chKey, d), 0);
      const endMs = parse(end) + DAY;
      const vids = videos(chKey).filter((v) => Date.parse(v.publishedAt) < endMs);
      const sumW = vids.reduce((s, v) => s + v.weight, 0) || 1;
      const rows = vids
        .map((v) => {
          const views = Math.round((total * 0.85 * v.weight) / sumW);
          const avd = Math.round(CHANNELS[chKey].minutesPerView * 60 * (0.8 + v.weight * 0.3));
          return [v.id, views, Math.round((views * avd) / 60), avd];
        })
        .filter((r) => r[1] > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, Number(q.get("maxResults") ?? 10));
      return json(200, { columnHeaders: ["video", "views", "estimatedMinutesWatched", "averageViewDuration"].map((name) => ({ name })), rows });
    }
    return apiError(400, "badRequest", "Unsupported report");
  }

  function svg(id) {
    const hue = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
    const round = id.startsWith("avatar-");
    const body = round
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="hsl(${hue} 55% 50%)"/><text x="44" y="56" font-size="36" text-anchor="middle" fill="#fff" font-family="sans-serif">${id.slice(7, 8).toUpperCase()}</text></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="hsl(${hue} 45% 42%)"/><text x="160" y="100" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif">${id}</text></svg>`;
    return { status: 200, headers: { "content-type": "image/svg+xml" }, body };
  }

  /** Handles one request. `url` may be absolute or a path. */
  function handle(method, url, bodyText = "", headers = {}) {
    const u = new URL(url, base);
    state.calls.push(`${method} ${u.pathname}`);
    if (u.pathname === "/auth") return chooserPage(u.searchParams);
    if (u.pathname === "/token" && method === "POST") return token(new URLSearchParams(bodyText));
    if (u.pathname === "/revoke" && method === "POST") {
      const t = new URLSearchParams(bodyText).get("token");
      state.revoked.add(t);
      state.revokedCalls.push(t);
      return json(200, {});
    }
    if (u.pathname.startsWith("/thumb/")) return svg(u.pathname.slice(7).replace(/\.svg$/, ""));
    // Test controls
    if (u.pathname === "/test/revoke") {
      for (const [rt, k] of refreshTokens) if (k === u.searchParams.get("account")) state.revoked.add(rt);
      return json(200, { ok: true });
    }
    if (u.pathname === "/test/restore") {
      state.revoked.clear();
      state.quotaExhausted = false;
      return json(200, { ok: true });
    }
    if (u.pathname === "/test/quota") {
      state.quotaExhausted = u.searchParams.get("on") === "1";
      return json(200, { ok: true });
    }
    if (u.pathname === "/test/state") return json(200, { revokedCalls: state.revokedCalls, dataThrough: dataThrough() });
    const key = account(headers);
    if (u.pathname.startsWith("/youtube/v3/") || u.pathname.startsWith("/analytics/v2/")) {
      if (!key) return apiError(401, "authError", "Invalid Credentials");
      return u.pathname.startsWith("/youtube/") ? youtube(u.pathname, u.searchParams, key) : analytics(u.searchParams, key);
    }
    return json(404, { error: "not found" });
  }

  /** fetch()-compatible adapter for in-process tests. */
  const fetchImpl = async (input, init = {}) => {
    const h = Object.fromEntries(new Headers(init.headers ?? {}).entries());
    const r = handle(init.method ?? "GET", String(input), typeof init.body === "string" ? init.body : "", h);
    return new Response(r.body, { status: r.status, headers: r.headers });
  };

  return { handle, fetch: fetchImpl, state, dataThrough, dailyRow, dailyViews, videos, issueRefreshToken };
}
