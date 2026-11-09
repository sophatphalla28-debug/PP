import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, safeEqual } from "@/lib/crypto";
import { signHandshake, signSession, verifyHandshake, verifySession } from "@/lib/session";

const key = randomBytes(32).toString("base64");

describe("refresh-token encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const enc = encryptSecret("1//refresh-token", key, "UC123");
    expect(enc).not.toContain("refresh-token");
    expect(decryptSecret(enc, key, "UC123")).toBe("1//refresh-token");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSecret("x", key, "a")).not.toBe(encryptSecret("x", key, "a"));
  });
  it("rejects a token copied to another channel, tampering and wrong keys", () => {
    const enc = encryptSecret("secret", key, "UC_A");
    expect(() => decryptSecret(enc, key, "UC_B")).toThrow();
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key, "UC_A")).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"), "UC_A")).toThrow();
  });
  it("compares secrets safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("signed cookies", () => {
  const secret = "s".repeat(40);
  it("verifies sessions and rejects forgeries or cross-use", async () => {
    const t = await signSession({ email: "me@example.com" }, secret);
    expect((await verifySession(t, secret))?.email).toBe("me@example.com");
    expect(await verifySession(t, "x".repeat(40))).toBeNull();
    expect(await verifySession(`${t}x`, secret)).toBeNull();
    // An OAuth handshake token is not accepted as a session (different audience).
    const h = await signHandshake({ state: "s", verifier: "v", flow: "login" }, secret);
    expect(await verifySession(h, secret)).toBeNull();
    expect((await verifyHandshake(h, secret))?.verifier).toBe("v");
  });
});
