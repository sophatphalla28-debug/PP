import { describe, expect, it } from "vitest";
import { summarizeWeek } from "@/lib/metrics";
import { buildActionPlan, buildReport, renderMarkdown } from "@/lib/report";
import { fmtDuration, fmtPct } from "@/lib/format";
import { inputs, meta, video, week } from "./helpers";

const W = "2026-11-01";
const PREV = "2026-10-25";
const now = new Date("2026-11-08T23:00:00Z");

function sample(partialDays = 7) {
  return summarizeWeek(
    inputs({
      weekStart: W,
      todayKst: partialDays < 7 ? "2026-11-07" : "2026-11-09",
      channels: [meta("A", "Channel A"), meta("B", "Channel B"), meta("C", "Channel C", { status: "needs_reauth" })],
      daily: [...week("A", PREV, 25_000), ...week("A", W, 35_000, partialDays), ...week("B", PREV, 50_000), ...week("B", W, 35_000, partialDays)],
      uploadsThisWeek: new Map([["A", 3], ["B", 0]]),
      uploadsLastWeek: new Map([["A", 2], ["B", 2]]),
      topVideos: [video("A", "abc123", 12_000, "How I <b>grew</b> fast")],
      bestVideos: new Map([["A", video("A", "abc123", 12_000, "How I <b>grew</b> fast")]]),
    }),
  );
}

describe("weekly report", () => {
  it("has every section from the brief", () => {
    const md = renderMarkdown(buildReport(sample(), now), { dashboardUrl: "https://yt.example.com" });
    for (const h of ["MY YOUTUBE WEEKLY REPORT", "OVERALL PERFORMANCE", "TOP 5 CHANNELS", "CHANNEL PERFORMANCE", "WINNERS AND LOSERS", "MY ACTION PLAN", "EXECUTIVE SUMMARY"]) {
      expect(md).toContain(h);
    }
    expect(md).toContain("**Week:** Sun, Nov 1 – Sat, Nov 7, 2026 (Korea time)");
    expect(md).toContain("- Total views: 70,000");
    expect(md).toContain("1. **Channel A** — 35,000 views (+40%)");
    expect(md).toContain("- Fastest-growing channel: Channel A (+40%");
    expect(md).toContain("- Biggest declining channel: Channel B (−30%");
    expect(md).toContain("https://www.youtube.com/watch?v=abc123");
    expect(md).toContain("Generated Mon, Nov 9, 08:00 KST");
  });

  it("never shows invented numbers for unavailable channels", () => {
    const md = renderMarkdown(buildReport(sample(), now));
    const c = md.slice(md.indexOf("### Channel C"));
    expect(c).toContain("not yet available from YouTube");
    expect(c).toContain("Disconnected");
    expect(md).toMatch(/Channel that needs attention: Channel C — Disconnected/);
  });

  it("flags partial data and compares the same days", () => {
    const md = renderMarkdown(buildReport(sample(5), now));
    expect(md).toContain("**Data note:**");
    expect(md).toContain("(5 of 7 days published)");
    expect(md).toContain("(same days)");
  });

  it("always gives exactly three specific recommendations", () => {
    const plan = buildActionPlan(sample());
    expect(plan).toHaveLength(3);
    expect(plan[0]).toMatch(/^Reconnect Channel C/);
    expect(plan[1]).toMatch(/^Double down on Channel A: views grew \+40% \(25,000 → 35,000 views\) with 3 new videos/);
    expect(plan[2]).toMatch(/^Investigate Channel B: views fell −30%.*published 0 videos versus 2/);

    const quiet = summarizeWeek(inputs({ weekStart: W, channels: [meta("Q")], daily: [...week("Q", PREV, 1000), ...week("Q", W, 1000)] }));
    expect(buildActionPlan(quiet)).toHaveLength(3);
  });
});

describe("formatting", () => {
  it("formats signed percentages and durations", () => {
    expect(fmtPct(40)).toBe("+40%");
    expect(fmtPct(-30)).toBe("−30%");
    expect(fmtPct(0.2)).toBe("0%");
    expect(fmtPct(null)).toBe("n/a");
    expect(fmtDuration(245)).toBe("4:05");
    expect(fmtDuration(3729)).toBe("1:02:09");
  });
});
