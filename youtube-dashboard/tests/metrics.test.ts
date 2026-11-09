import { describe, expect, it } from "vitest";
import { growth, summarizeWeek, trendStatus, weeklySeries } from "@/lib/metrics";
import { fillDailyGaps } from "@/lib/sync";
import { inputs, meta, video, week } from "./helpers";

const W = "2026-11-01"; // Sunday
const PREV = "2026-10-25";

describe("weekly comparison (the brief's example)", () => {
  const s = summarizeWeek(
    inputs({
      weekStart: W,
      channels: [meta("A", "Channel A"), meta("B", "Channel B")],
      daily: [...week("A", PREV, 25_000), ...week("A", W, 35_000), ...week("B", PREV, 50_000), ...week("B", W, 35_000)],
      topVideos: [video("A", "vidA", 9000, "Best A video")],
    }),
  );
  const a = s.channels.find((c) => c.channel.id === "A")!;
  const b = s.channels.find((c) => c.channel.id === "B")!;

  it("computes +40% and −30%", () => {
    expect(a.views).toBe(35_000);
    expect(a.lastSameDays.views).toBe(25_000);
    expect(a.growthPct).toBeCloseTo(40);
    expect(a.status).toBe("growing");
    expect(b.growthPct).toBeCloseTo(-30);
    expect(b.status).toBe("declining");
  });

  it("totals and overall growth", () => {
    expect(s.totals.views).toBe(70_000);
    expect(s.totals.lastSameDays.views).toBe(75_000);
    expect(s.totals.growthPct).toBeCloseTo(-6.667, 2);
    expect(s.completeness.complete).toBe(true);
    expect(s.completeness.note).toBeNull();
  });

  it("picks winners and losers", () => {
    expect(s.highlights.fastestGrowing?.channel.id).toBe("A");
    expect(s.highlights.biggestDecline?.channel.id).toBe("B");
    expect(s.highlights.highestViewed?.channel.id).toBe("A"); // tie on views → alphabetical
    expect(s.highlights.bestVideo?.title).toBe("Best A video");
    expect(s.highlights.needsAttention?.channel.channel.id).toBe("B");
  });
});

describe("incomplete weeks are compared like-for-like, never padded with zeros", () => {
  it("compares only the days YouTube has published", () => {
    // This week: only Sun–Thu (5 days) published. Last week complete.
    const s = summarizeWeek(
      inputs({
        weekStart: W,
        todayKst: "2026-11-08",
        channels: [meta("A")],
        daily: [...week("A", PREV, 7000), ...week("A", W, 7000, 5)],
      }),
    );
    const a = s.channels[0];
    expect(a.daysAvailable).toBe(5);
    expect(a.views).toBe(5000); // 1000/day × 5
    expect(a.lastSameDays.views).toBe(5000); // last week's Sun–Thu
    expect(a.lastFullWeek.views).toBe(7000);
    expect(a.growthPct).toBeCloseTo(0);
    expect(s.completeness.complete).toBe(false);
    expect(s.completeness.maxDays).toBe(5);
    expect(s.completeness.note).toMatch(/through Thu, Nov 5 \(5 of 7 days\)/);
  });

  it("reports missing data as unavailable instead of zero growth", () => {
    const s = summarizeWeek(inputs({ weekStart: W, todayKst: "2026-11-02", channels: [meta("A")], daily: week("A", PREV, 7000) }));
    expect(s.channels[0].daysAvailable).toBe(0);
    expect(s.channels[0].growthPct).toBeNull();
    expect(s.channels[0].status).toBe("no-data");
    expect(s.totals.growthPct).toBeNull();
    expect(s.completeness.inProgress).toBe(true);
    expect(s.completeness.note).toMatch(/hasn't published any data/);
  });

  it("marks channels with no views last week as new rather than infinite growth", () => {
    const s = summarizeWeek(inputs({ weekStart: W, channels: [meta("N")], daily: [...week("N", PREV, 0), ...week("N", W, 700)] }));
    expect(s.channels[0].growthPct).toBeNull();
    expect(s.channels[0].status).toBe("new");
  });

  it("ignores tiny bases when naming the fastest-growing channel", () => {
    const s = summarizeWeek(
      inputs({
        weekStart: W,
        channels: [meta("tiny"), meta("big")],
        daily: [...week("tiny", PREV, 7), ...week("tiny", W, 70), ...week("big", PREV, 10_000), ...week("big", W, 11_000)],
      }),
    );
    expect(s.highlights.fastestGrowing?.channel.id).toBe("big");
  });

  it("flags disconnected channels first under 'needs attention'", () => {
    const s = summarizeWeek(
      inputs({
        weekStart: W,
        channels: [meta("ok"), meta("off", "Off", { status: "needs_reauth" })],
        daily: [...week("ok", PREV, 1000), ...week("ok", W, 500)],
      }),
    );
    expect(s.highlights.needsAttention?.channel.channel.id).toBe("off");
  });
});

describe("helpers", () => {
  it("growth and status thresholds", () => {
    expect(growth(110, 100)).toBeCloseTo(10);
    expect(growth(5, 0)).toBeNull();
    expect(trendStatus(7, 4.9, 1)).toBe("stable");
    expect(trendStatus(7, 5, 1)).toBe("growing");
    expect(trendStatus(7, -5, 1)).toBe("declining");
  });

  it("fills zero-activity gaps only up to the latest published day", () => {
    const { rows, latest } = fillDailyGaps("A", "2026-11-01", [
      { day: "2026-11-02", views: 5, watchMinutes: 1, subscribersGained: 0, subscribersLost: 0 },
      { day: "2026-11-04", views: 9, watchMinutes: 1, subscribersGained: 0, subscribersLost: 0 },
    ]);
    expect(latest).toBe("2026-11-04");
    expect(rows.map((r) => [r.day, r.views])).toEqual([
      ["2026-11-01", 0],
      ["2026-11-02", 5],
      ["2026-11-03", 0],
      ["2026-11-04", 9],
    ]);
    expect(fillDailyGaps("A", "2026-11-01", [])).toEqual({ rows: [], latest: null });
  });

  it("never plots a week YouTube hasn't published yet as zero", () => {
    const pts = weeklySeries(week("A", PREV, 700), ["A"], PREV, "2026-11-08");
    expect(pts.map((p) => p.weekStart)).toEqual([PREV]);
  });

  it("builds weekly series and flags partial weeks", () => {
    const daily = [...week("A", PREV, 700), ...week("A", W, 1400, 3)];
    const pts = weeklySeries(daily, ["A"], "2026-10-18", W);
    expect(pts.map((p) => [p.weekStart, p.views, p.partial])).toEqual([
      [PREV, 700, false],
      [W, 1400 - 200 * 4, true],
    ]);
  });
});
