import "server-only";
import { NextResponse } from "next/server";
import { env, isSecureApp, redirectUri } from "./env";
import { randomToken } from "./crypto";
import { buildAuthUrl } from "./google/oauth";
import { OAUTH_COOKIE, OAUTH_TTL_SECONDS, cookieOptions, signHandshake, type OAuthFlow } from "./session";

/** Redirects to Google's consent screen with a signed state + PKCE verifier cookie. */
export async function startOAuth(flow: OAuthFlow): Promise<NextResponse> {
  const e = env();
  const state = randomToken(24);
  const verifier = randomToken(48);
  const url = buildAuthUrl(flow, { clientId: e.GOOGLE_CLIENT_ID, redirectUri: redirectUri(), state, verifier });
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, await signHandshake({ state, verifier, flow }, e.SESSION_SECRET), cookieOptions(isSecureApp(), OAUTH_TTL_SECONDS));
  return res;
}

export function appRedirect(path: string, params: Record<string, string> = {}): NextResponse {
  const url = new URL(path, env().APP_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}
