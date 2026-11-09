import { SignJWT, jwtVerify } from "jose";

/** Signed, httpOnly cookies for the dashboard owner session and the in-flight OAuth handshake. */
export const SESSION_COOKIE = "ytd_session";
export const OAUTH_COOKIE = "ytd_oauth";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const OAUTH_TTL_SECONDS = 60 * 10;

export type SessionPayload = { email: string; name?: string };
export type OAuthFlow = "login" | "connect";
export type OAuthHandshake = { state: string; verifier: string; flow: OAuthFlow; returnTo?: string };

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

async function sign(payload: Record<string, unknown>, secret: string, ttl: number, audience: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(audience)
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(key(secret));
}

async function verify<T>(token: string | undefined, secret: string, audience: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { audience, algorithms: ["HS256"] });
    return payload as T;
  } catch {
    return null;
  }
}

export const signSession = (p: SessionPayload, secret: string) => sign(p, secret, SESSION_TTL_SECONDS, "ytd-session");
export const verifySession = (t: string | undefined, secret: string) => verify<SessionPayload>(t, secret, "ytd-session");
export const signHandshake = (p: OAuthHandshake, secret: string) => sign(p, secret, OAUTH_TTL_SECONDS, "ytd-oauth");
export const verifyHandshake = (t: string | undefined, secret: string) => verify<OAuthHandshake>(t, secret, "ytd-oauth");

export function cookieOptions(secure: boolean, maxAge: number) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge };
}
