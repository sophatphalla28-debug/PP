import { createHash } from "node:crypto";
import { googleMockBase } from "../env";
import { GoogleApiError, googleRequest, type HttpOptions } from "./http";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;
const LOGIN_SCOPES = ["openid", "email", "profile"];

export function endpoints() {
  const mock = googleMockBase();
  return {
    auth: mock ? `${mock}/auth` : "https://accounts.google.com/o/oauth2/v2/auth",
    token: mock ? `${mock}/token` : "https://oauth2.googleapis.com/token",
    revoke: mock ? `${mock}/revoke` : "https://oauth2.googleapis.com/revoke",
    youtube: mock ? `${mock}/youtube/v3` : "https://www.googleapis.com/youtube/v3",
    analytics: mock ? `${mock}/analytics/v2` : "https://youtubeanalytics.googleapis.com/v2",
  };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export type ClientCreds = { clientId: string; clientSecret: string; redirectUri: string };

/**
 * login   → identifies the dashboard owner (email only).
 * connect → read-only YouTube + Analytics access for one channel, with a refresh token.
 *           `select_account consent` lets you pick any Google account or Brand Account each time.
 */
export function buildAuthUrl(
  flow: "login" | "connect",
  args: { clientId: string; redirectUri: string; state: string; verifier: string },
): string {
  const scopes = flow === "login" ? LOGIN_SCOPES : ["openid", "email", ...YOUTUBE_SCOPES];
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state: args.state,
    code_challenge: pkceChallenge(args.verifier),
    code_challenge_method: "S256",
  });
  if (flow === "connect") {
    params.set("access_type", "offline");
    params.set("prompt", "select_account consent");
    params.set("include_granted_scopes", "false");
  } else {
    params.set("prompt", "select_account");
  }
  return `${endpoints().auth}?${params}`;
}

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  token_type: string;
};

function form(body: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  };
}

export async function exchangeCode(code: string, verifier: string, c: ClientCreds, http?: HttpOptions) {
  return googleRequest<TokenResponse>(
    endpoints().token,
    form({
      code,
      code_verifier: verifier,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      grant_type: "authorization_code",
    }),
    { ...http, retries: 1 },
  );
}

export async function refreshAccessToken(refreshToken: string, c: Omit<ClientCreds, "redirectUri">, http?: HttpOptions) {
  const res = await googleRequest<TokenResponse>(
    endpoints().token,
    form({
      refresh_token: refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: "refresh_token",
    }),
    http,
  );
  return res.access_token;
}

/** Best effort: tells Google to drop the grant when a channel is removed. */
export async function revokeToken(token: string, http?: HttpOptions): Promise<boolean> {
  try {
    await googleRequest<unknown>(endpoints().revoke, form({ token }), { ...http, retries: 1 });
    return true;
  } catch {
    return false;
  }
}

export type IdTokenClaims = {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  exp: number;
};

/**
 * Reads the ID token returned by Google's token endpoint. It arrives directly from Google over TLS
 * in exchange for our client secret, so per Google's guidance we check the claims rather than the
 * signature.
 */
export function readIdToken(idToken: string | undefined, clientId: string): IdTokenClaims {
  if (!idToken) throw new GoogleApiError("Google did not return an ID token", "bad_request", 400);
  const part = idToken.split(".")[1];
  const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as IdTokenClaims;
  const issuers = ["https://accounts.google.com", "accounts.google.com"];
  const mock = googleMockBase();
  if (mock) issuers.push(mock);
  if (!issuers.includes(claims.iss)) throw new GoogleApiError("Unexpected ID token issuer", "forbidden", 400);
  if (claims.aud !== clientId) throw new GoogleApiError("ID token was issued to another app", "forbidden", 400);
  if (claims.exp * 1000 < Date.now()) throw new GoogleApiError("ID token expired", "forbidden", 400);
  return claims;
}

export function hasYoutubeScopes(scope: string | undefined): boolean {
  const granted = new Set((scope ?? "").split(/\s+/));
  return YOUTUBE_SCOPES.every((s) => granted.has(s));
}
