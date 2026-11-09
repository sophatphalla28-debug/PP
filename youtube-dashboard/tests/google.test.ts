import { describe, expect, it } from "vitest";
import { classify, googleRequest } from "@/lib/google/http";
import { buildAuthUrl, hasYoutubeScopes, pkceChallenge, readIdToken } from "@/lib/google/oauth";

const noSleep = async () => {};
const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("error classification", () => {
  it("maps Google errors to actions", () => {
    expect(classify(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }).kind).toBe("revoked");
    expect(classify(403, { error: { code: 403, errors: [{ reason: "quotaExceeded" }] } }).kind).toBe("quota");
    expect(classify(403, { error: { code: 403, errors: [{ reason: "rateLimitExceeded" }] } }).kind).toBe("rate");
    expect(classify(429, null).kind).toBe("rate");
    expect(classify(401, { error: { code: 401 } }).kind).toBe("auth");
    expect(classify(403, { error: { code: 403, errors: [{ reason: "forbidden" }] } }).kind).toBe("forbidden");
    expect(classify(503, null).kind).toBe("transient");
  });

  it("retries rate limits and server errors, then succeeds", async () => {
    const seq = [res(429, {}), res(503, {}), res(200, { ok: 1 })];
    let n = 0;
    const out = await googleRequest<{ ok: number }>("https://x", {}, { fetch: async () => seq[n++], sleep: noSleep });
    expect(out.ok).toBe(1);
    expect(n).toBe(3);
  });

  it("does not retry quota exhaustion or revoked tokens", async () => {
    let n = 0;
    await expect(
      googleRequest("https://x", {}, { fetch: async () => (n++, res(403, { error: { errors: [{ reason: "quotaExceeded" }] } })), sleep: noSleep }),
    ).rejects.toMatchObject({ kind: "quota" });
    expect(n).toBe(1);
  });

  it("gives up after the retry limit", async () => {
    let n = 0;
    await expect(googleRequest("https://x", {}, { fetch: async () => (n++, res(500, {})), sleep: noSleep, retries: 2 })).rejects.toMatchObject({ kind: "transient" });
    expect(n).toBe(3);
  });
});

describe("OAuth", () => {
  it("requests read-only scopes, offline access and the account chooser for channels", () => {
    const u = new URL(buildAuthUrl("connect", { clientId: "cid", redirectUri: "https://app/api/auth/callback", state: "st", verifier: "ver" }));
    const scope = u.searchParams.get("scope")!;
    expect(scope).toContain("https://www.googleapis.com/auth/youtube.readonly");
    expect(scope).toContain("https://www.googleapis.com/auth/yt-analytics.readonly");
    expect(scope).not.toMatch(/youtube(\s|$)|youtube\.force-ssl|upload/);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("select_account consent");
    expect(u.searchParams.get("code_challenge")).toBe(pkceChallenge("ver"));
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("sign-in only asks for identity", () => {
    const u = new URL(buildAuthUrl("login", { clientId: "cid", redirectUri: "r", state: "s", verifier: "v" }));
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("access_type")).toBeNull();
  });

  it("detects partially granted scopes", () => {
    expect(hasYoutubeScopes("openid https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly")).toBe(true);
    expect(hasYoutubeScopes("openid https://www.googleapis.com/auth/youtube.readonly")).toBe(false);
  });

  it("validates ID token claims", () => {
    const tok = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
    const exp = Math.floor(Date.now() / 1000) + 600;
    expect(readIdToken(tok({ iss: "https://accounts.google.com", aud: "cid", sub: "1", email: "a@b.c", exp }), "cid").email).toBe("a@b.c");
    expect(() => readIdToken(tok({ iss: "https://evil.example", aud: "cid", sub: "1", exp }), "cid")).toThrow(/issuer/);
    expect(() => readIdToken(tok({ iss: "accounts.google.com", aud: "other", sub: "1", exp }), "cid")).toThrow(/another app/);
    expect(() => readIdToken(tok({ iss: "accounts.google.com", aud: "cid", sub: "1", exp: 1 }), "cid")).toThrow(/expired/);
  });
});
