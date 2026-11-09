import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { safeEqual } from "./crypto";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";

export function isAllowedEmail(email: string | undefined | null, allowed: string[]): boolean {
  return !!email && allowed.includes(email.trim().toLowerCase());
}

export async function getOwner(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token, env().SESSION_SECRET);
  // Re-check the allowlist so removing an email from ALLOWED_EMAILS revokes access immediately.
  if (!session || !isAllowedEmail(session.email, env().allowedEmails)) return null;
  return session;
}

/** For pages and server actions: redirects to /login when not signed in. */
export async function requireOwner(): Promise<SessionPayload> {
  const owner = await getOwner();
  if (!owner) redirect("/login");
  return owner;
}

/** For route handlers called by schedulers: `Authorization: Bearer <CRON_SECRET>`. */
export function hasCronSecret(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return !!match && safeEqual(match[1].trim(), env().CRON_SECRET);
}

/** Rejects cross-site POSTs to cookie-authenticated route handlers. */
export async function isSameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return true; // same-origin navigations from older browsers omit Origin on GET/HEAD
  return origin === new URL(env().APP_URL).origin;
}
