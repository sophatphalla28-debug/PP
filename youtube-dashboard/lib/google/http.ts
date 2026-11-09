/**
 * Thin fetch wrapper for Google APIs: classifies errors (auth / quota / rate / transient)
 * and retries rate-limit and 5xx responses with exponential backoff.
 */
export type GoogleErrorKind =
  | "revoked" // refresh token no longer valid → channel must be reconnected
  | "auth" // access token rejected
  | "quota" // daily quota exhausted → stop the run, resume tomorrow
  | "rate" // short-term rate limit → retried automatically
  | "transient" // 5xx / network → retried automatically
  | "forbidden" // permission problem (e.g. scope not granted)
  | "not_found"
  | "bad_request";

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly kind: GoogleErrorKind,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded", "dailyLimitExceededUnreg"]);
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "RATE_LIMIT_EXCEEDED"]);

type GoogleErrorBody = {
  error?:
    | string
    | { code?: number; message?: string; status?: string; errors?: { reason?: string; message?: string }[] };
  error_description?: string;
};

export function classify(status: number, body: GoogleErrorBody | null): GoogleApiError {
  const err = body?.error;
  // OAuth token endpoint errors look like { error: "invalid_grant", error_description: "..." }
  if (typeof err === "string") {
    const msg = body?.error_description || err;
    if (err === "invalid_grant") return new GoogleApiError(`Google access was revoked or expired: ${msg}`, "revoked", status, err);
    if (status === 401 || err === "invalid_client" || err === "unauthorized_client")
      return new GoogleApiError(`OAuth client rejected: ${msg}`, "forbidden", status, err);
    return new GoogleApiError(msg, status >= 500 ? "transient" : "bad_request", status, err);
  }
  const reason = err?.errors?.[0]?.reason ?? err?.status;
  const message = err?.message || `Google API error ${status}`;
  if (reason && QUOTA_REASONS.has(reason)) return new GoogleApiError(message, "quota", status, reason);
  if (status === 429 || (reason && RATE_REASONS.has(reason))) return new GoogleApiError(message, "rate", status, reason);
  if (status === 401) return new GoogleApiError(message, "auth", status, reason);
  if (status === 403) return new GoogleApiError(message, "forbidden", status, reason);
  if (status === 404) return new GoogleApiError(message, "not_found", status, reason);
  if (status >= 500) return new GoogleApiError(message, "transient", status, reason);
  return new GoogleApiError(message, "bad_request", status, reason);
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpOptions = {
  fetch?: FetchLike;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function googleRequest<T>(url: string, init: RequestInit, opts: HttpOptions = {}): Promise<T> {
  const doFetch = opts.fetch ?? fetch;
  const retries = opts.retries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
    } catch (e) {
      const error = new GoogleApiError(`Network error calling Google: ${(e as Error).message}`, "transient", 0);
      if (attempt >= retries) throw error;
      await sleep(backoff(attempt++));
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    let body: GoogleErrorBody | null = null;
    try {
      body = (await res.json()) as GoogleErrorBody;
    } catch {
      body = null;
    }
    const error = classify(res.status, body);
    if ((error.kind === "rate" || error.kind === "transient") && attempt < retries) {
      await sleep(backoff(attempt++));
      continue;
    }
    throw error;
  }
}

function backoff(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}
