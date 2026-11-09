import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CHANNELS, createFakeGoogle } from "../scripts/e2e/fake-google.mjs";
import { applySchema, createSql, type Sql } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import * as repo from "@/lib/repo";
import { syncAll, type SyncDeps } from "@/lib/sync";
import { generateAndStoreReport, loadWeekSummary } from "@/lib/service";
import { addDays, datesBetween, kstMidnightUtc } from "@/lib/time";

/**
 * Integration test against a real PostgreSQL database and the fake Google API.
 * Run with TEST_DATABASE_URL=postgres://… (skipped otherwise).
 */
const DB_URL = process.env.TEST_DATABASE_URL;
const KEY = randomBytes(32).toString("base64");
const BASE = "http://fake-google.test";

Object.assign(process.env, {
  TEST_ONLY_GOOGLE_MOCK_URL: BASE,
  DATABASE_URL: DB_URL ?? "postgres://unused",
  APP_URL: "https://dash.example.com",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  ALLOWED_EMAILS: "owner@example.com",
  SESSION_SECRET: "s".repeat(40),
  TOKEN_ENCRYPTION_KEY: KEY,
  CRON_SECRET: "c".repeat(32),
});

type Fake = ReturnType<typeof createFakeGoogle>;
const ids = { alpha: CHANNELS.alpha.id as string, beta: CHANNELS.beta.id as string, gamma: CHANNELS.gamma.id as string };

describe.skipIf(!DB_URL)("sync engine + database", () => {
  let sql: Sql;
  let fake: Fake;
  let now = new Date("2026-11-09T04:00:00Z"); // Mon 13:00 KST; Pacific date Sun Nov 8
  const deps = (): SyncDeps => ({
    sql,
    now,
    clientId: "test-client",
    clientSecret: "test-secret",
    encryptionKey: KEY,
    http: { fetch: fake.fetch, sleep: async () => {} },
  });

  beforeAll(async () => {
    sql = createSql(DB_URL!);
    await sql.unsafe(`drop schema public cascade; create schema public;`);
    await applySchema(sql);
    await applySchema(sql); // idempotent
  });
  afterAll(async () => {
    await sql?.end();
  });
  beforeEach(() => {
    fake = createFakeGoogle({ base: BASE, now: () => now, anchorDate: "2026-11-08" });
    for (const k of ["alpha", "beta", "gamma"]) fake.issueRefreshToken(k);
  });

  async function connect(key: "alpha" | "beta" | "gamma") {
    const c = CHANNELS[key];
    await repo.upsertChannel(sql, {
      id: c.id,
      title: c.title,
      customUrl: null,
      thumbnailUrl: null,
      uploadsPlaylistId: `UU-${key}`,
      googleEmail: `${key}@example.com`,
      refreshTokenEnc: encryptSecret(`rt-${key}`, KEY, c.id),
      scopes: "youtube.readonly yt-analytics.readonly",
    });
  }

  it("backfills 12 weeks for every channel on first sync", async () => {
    await connect("alpha");
    await connect("beta");
    await connect("gamma");
    const run = await syncAll(deps(), { trigger: "test" });
    expect(run.results.map((r) => [r.title, r.ok, r.error])).toEqual(
      expect.arrayContaining([
        ["Test Channel Alpha", true, undefined],
        ["Test Channel Beta", true, undefined],
        ["Test Channel Gamma", true, undefined],
      ]),
    );
    expect(run.status).toBe("success");

    const channels = await repo.listChannels(sql);
    expect(channels.map((c) => c.dataThrough)).toEqual(["2026-11-06", "2026-11-06", "2026-11-06"]); // 2-day YouTube delay
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from channel_daily_stats where channel_id = ${ids.alpha}`;
    expect(n).toBe(datesBetween("2026-08-16", "2026-11-06").length);

    const [row] = await repo.getDailyStats(sql, [ids.alpha], "2026-11-03", "2026-11-03");
    const expected = fake.dailyRow("alpha", "2026-11-03");
    expect(row.views).toBe(expected.views);
    expect(row.subscribersGained).toBe(expected.gained);

    const snaps = await repo.latestSnapshots(sql, [ids.beta], "2026-12-31");
    expect(snaps[0].subscriberCount).toBe(CHANNELS.beta.subs);
  });

  it("re-syncing never duplicates and picks up newly published days", async () => {
    const count = async () => (await sql<{ n: number }[]>`select count(*)::int n from channel_daily_stats`)[0].n;
    const before = await count();
    await syncAll(deps(), { trigger: "test" });
    expect(await count()).toBe(before);

    now = new Date(now.getTime() + 86_400_000); // a day later YouTube publishes Saturday
    await syncAll(deps(), { trigger: "test" });
    expect(await count()).toBe(before + 3);
    expect((await repo.listChannels(sql)).every((c) => c.dataThrough === "2026-11-07")).toBe(true);
  });

  it("counts uploads per exact Korea-time week and stores top videos", async () => {
    const week = "2026-11-01";
    const counts = await repo.uploadCounts(sql, [ids.alpha], kstMidnightUtc(week), kstMidnightUtc(addDays(week, 7)));
    const expected = fake
      .videos("alpha")
      .filter((v: { publishedAt: string }) => v.publishedAt >= kstMidnightUtc(week).toISOString() && v.publishedAt < kstMidnightUtc(addDays(week, 7)).toISOString()).length;
    expect(counts.get(ids.alpha) ?? 0).toBe(expected);
    expect(expected).toBeGreaterThan(0);

    const top = await repo.topVideosForWeek(sql, week, Object.values(ids), 10);
    expect(top).toHaveLength(10);
    expect(top.map((t) => t.views)).toEqual([...top.map((t) => t.views)].sort((a, b) => b - a));
    expect(top[0].title).toMatch(/test video/);
    expect(top[0].averageViewDurationSeconds).toBeGreaterThan(0);
  });

  it("weekly summary matches the raw YouTube numbers", async () => {
    const { summary } = await loadWeekSummary(sql, { weekStart: "2026-11-01", now });
    const alpha = summary.channels.find((c) => c.channel.id === ids.alpha)!;
    const days = datesBetween("2026-11-01", "2026-11-07");
    const expectViews = days.reduce((s, d) => s + fake.dailyRow("alpha", d).views, 0);
    const expectLast = days.reduce((s, d) => s + fake.dailyRow("alpha", addDays(d, -7)).views, 0);
    expect(alpha.daysAvailable).toBe(7);
    expect(alpha.views).toBe(expectViews);
    expect(alpha.lastSameDays.views).toBe(expectLast);
    expect(alpha.growthPct).toBeCloseTo(((expectViews - expectLast) / expectLast) * 100, 6);
    expect(alpha.status).toBe("growing"); // fixture grows 12%/week
    expect(summary.channels.find((c) => c.channel.id === ids.beta)!.status).toBe("declining");
    expect(summary.highlights.fastestGrowing?.channel.id).toBe(ids.alpha);
  });

  it("stores one report per week and overwrites on regeneration", async () => {
    const a = await generateAndStoreReport(sql, { weekStart: "2026-11-01", trigger: "test", now });
    await generateAndStoreReport(sql, { weekStart: "2026-11-01", trigger: "test", now });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from weekly_reports`;
    expect(n).toBe(1);
    expect(a.markdown).toContain("MY YOUTUBE WEEKLY REPORT");
    expect(a.markdown).toContain("Test Channel Alpha");
    expect(a.report.actionPlan).toHaveLength(3);
  });

  it("marks a revoked channel for reconnection and keeps syncing the others", async () => {
    fake.state.revoked.add("rt-beta");
    const run = await syncAll(deps(), { trigger: "test" });
    expect(run.status).toBe("partial");
    const beta = run.results.find((r) => r.channelId === ids.beta)!;
    expect(beta.errorKind).toBe("revoked");
    const rows = await repo.listChannels(sql);
    expect(rows.find((c) => c.id === ids.beta)!.status).toBe("needs_reauth");
    expect(rows.find((c) => c.id === ids.alpha)!.status).toBe("active");

    // Next run skips it entirely (no wasted calls) until it is reconnected.
    const next = await syncAll(deps(), { trigger: "test" });
    expect(next.results.map((r) => r.channelId)).not.toContain(ids.beta);

    // Reconnecting (new grant) restores it.
    fake.state.revoked.clear();
    await connect("beta");
    expect((await repo.listChannels(sql)).find((c) => c.id === ids.beta)!.status).toBe("active");
  });

  it("retries a rate limit transparently", async () => {
    fake.state.rateLimitNext = 2;
    const run = await syncAll(deps(), { trigger: "test", onlyChannelId: ids.gamma });
    expect(run.results[0].ok).toBe(true);
  });

  it("stops the run when the YouTube quota is exhausted", async () => {
    fake.state.quotaExhausted = true;
    const run = await syncAll(deps(), { trigger: "test", concurrency: 1 });
    expect(run.results).toHaveLength(1);
    expect(run.results[0].errorKind).toBe("quota");
    expect(run.stoppedReason).toMatch(/quota/i);
    expect(run.skipped.length).toBe(2);
    expect((await repo.listChannels(sql)).find((c) => c.id === run.results[0].channelId)!.status).toBe("error");
  });

  it("tracks API usage per Pacific-time day", async () => {
    const usage = await repo.getQuotaUsage(sql, "2026-11-08");
    expect(usage.data).toBeGreaterThan(0);
    expect(usage.analytics).toBeGreaterThan(0);
  });

  it("removing a channel deletes all of its data", async () => {
    const enc = await repo.deleteChannel(sql, ids.gamma);
    expect(enc).toBeTruthy();
    for (const t of ["channel_daily_stats", "channel_snapshots", "videos", "weekly_video_stats"]) {
      const [{ n }] = await sql.unsafe<{ n: number }[]>(`select count(*)::int n from ${t} where channel_id = $1`, [ids.gamma]);
      expect(n).toBe(0);
    }
  });
});
