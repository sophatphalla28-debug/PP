import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env, isSecureApp, redirectUri } from "@/lib/env";
import { encryptSecret } from "@/lib/crypto";
import { getOwner, isAllowedEmail } from "@/lib/auth";
import { exchangeCode, hasYoutubeScopes, readIdToken, revokeToken } from "@/lib/google/oauth";
import { getMyChannels } from "@/lib/google/youtube";
import { GoogleApiError } from "@/lib/google/http";
import { appRedirect } from "@/lib/oauth-flow";
import * as repo from "@/lib/repo";
import { syncDepsFor } from "@/lib/service";
import { syncAll } from "@/lib/sync";
import { pacificDate } from "@/lib/time";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  cookieOptions,
  signSession,
  verifyHandshake,
} from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Google redirects here after consent, for both owner sign-in and channel connection. */
export async function GET(request: NextRequest) {
  const res = await handle(request);
  res.cookies.delete(OAUTH_COOKIE); // one-time handshake
  return res;
}

async function handle(request: NextRequest) {
  const e = env();
  const params = request.nextUrl.searchParams;
  const jar = await cookies();
  const handshake = await verifyHandshake(jar.get(OAUTH_COOKIE)?.value, e.SESSION_SECRET);

  if (!handshake || !params.get("state") || params.get("state") !== handshake.state) {
    return appRedirect("/login", { error: "expired" });
  }
  const failTo = handshake.flow === "login" ? "/login" : "/channels";
  if (params.get("error")) {
    return appRedirect(failTo, { error: params.get("error") === "access_denied" ? "denied" : "google" });
  }
  const code = params.get("code");
  if (!code) return appRedirect(failTo, { error: "google" });

  try {
    const tokens = await exchangeCode(code, handshake.verifier, {
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      redirectUri: redirectUri(),
    });
    const claims = readIdToken(tokens.id_token, e.GOOGLE_CLIENT_ID);

    if (handshake.flow === "login") {
      if (!claims.email_verified || !isAllowedEmail(claims.email, e.allowedEmails)) {
        return appRedirect("/login", { error: "not_allowed" });
      }
      const res = appRedirect("/");
      res.cookies.set(
        SESSION_COOKIE,
        await signSession({ email: claims.email!.toLowerCase(), name: claims.name }, e.SESSION_SECRET),
        cookieOptions(isSecureApp(), SESSION_TTL_SECONDS),
      );
      return res;
    }

    // ── Channel connection ───────────────────────────────────────────────
    if (!(await getOwner())) return appRedirect("/login", { error: "expired" });
    const sql = await db();
    if (!hasYoutubeScopes(tokens.scope)) {
      // Google revokes the whole grant for an account, so only revoke when that account isn't
      // already connected — otherwise a working connection would break.
      let alreadyConnected = false;
      try {
        const mine = await getMyChannels(tokens.access_token, () => {});
        const known = new Set((await repo.listChannels(sql)).map((c) => c.id));
        alreadyConnected = mine.some((c) => known.has(c.id));
      } catch {
        alreadyConnected = false; // without youtube.readonly we can't tell; nothing was stored
      }
      if (!alreadyConnected) await revokeToken(tokens.refresh_token ?? tokens.access_token);
      return appRedirect("/channels", { error: "scopes" });
    }
    if (!tokens.refresh_token) return appRedirect("/channels", { error: "no_refresh" });

    const channels = await getMyChannels(tokens.access_token, (api, units) => repo.addQuotaUsage(sql, pacificDate(new Date()), api, units));
    if (!channels.length) {
      await revokeToken(tokens.refresh_token);
      return appRedirect("/channels", { error: "no_channel" });
    }
    const connected: string[] = [];
    for (const ch of channels) {
      await repo.upsertChannel(sql, {
        id: ch.id,
        title: ch.title,
        customUrl: ch.customUrl,
        thumbnailUrl: ch.thumbnailUrl,
        uploadsPlaylistId: ch.uploadsPlaylistId,
        googleEmail: claims.email ?? null,
        refreshTokenEnc: encryptSecret(tokens.refresh_token, e.TOKEN_ENCRYPTION_KEY, ch.id),
        scopes: tokens.scope ?? "",
      });
      connected.push(ch.title);
      // First sync backfills 12 weeks so week-over-week comparisons work immediately.
      await syncAll(syncDepsFor(sql), { trigger: "connect", onlyChannelId: ch.id, timeBudgetMs: 90_000 });
    }
    return appRedirect("/channels", { connected: connected.join(", ") });
  } catch (err) {
    console.error("OAuth callback failed", err instanceof GoogleApiError ? `${err.kind}: ${err.message}` : err);
    return appRedirect(failTo, { error: "google" });
  }
}
