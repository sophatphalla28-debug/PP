import { describe, expect, it } from "vitest";
import {
  addDays, currentWeekStart, datesBetween, formatWeek, kstDate, kstMidnightUtc,
  lastCompletedWeekStart, nextReportTime, pacificDate, weekStartOf,
} from "@/lib/time";

describe("Korea-time weeks (Sun 00:00 → Sat 23:59 KST)", () => {
  it("uses the Korean calendar date, not UTC", () => {
    // 2026-11-07T15:30Z is Sunday 00:30 in Seoul but still Saturday in UTC.
    expect(kstDate(new Date("2026-11-07T15:30:00Z"))).toBe("2026-11-08");
    expect(kstDate(new Date("2026-11-07T14:59:59Z"))).toBe("2026-11-07");
  });

  it("starts weeks on Sunday", () => {
    expect(weekStartOf("2026-11-08")).toBe("2026-11-08"); // Sunday
    expect(weekStartOf("2026-11-14")).toBe("2026-11-08"); // Saturday
    expect(weekStartOf("2026-11-15")).toBe("2026-11-15");
  });

  it("switches weeks exactly at Sunday 00:00 KST", () => {
    expect(currentWeekStart(new Date("2026-11-14T14:59:59Z"))).toBe("2026-11-08"); // Sat 23:59:59 KST
    expect(currentWeekStart(new Date("2026-11-14T15:00:00Z"))).toBe("2026-11-15"); // Sun 00:00 KST
  });

  it("reports on the week that just ended when run Sunday 08:00 KST", () => {
    const sundayEight = new Date("2026-11-14T23:00:00Z");
    expect(lastCompletedWeekStart(sundayEight)).toBe("2026-11-08");
    expect(formatWeek("2026-11-08")).toBe("Sun, Nov 8 – Sat, Nov 14, 2026");
  });

  it("computes the next Sunday 08:00 KST run", () => {
    expect(nextReportTime(new Date("2026-11-09T04:00:00Z")).toISOString()).toBe("2026-11-14T23:00:00.000Z");
    // Exactly at the run time → the following week
    expect(nextReportTime(new Date("2026-11-14T23:00:00Z")).toISOString()).toBe("2026-11-21T23:00:00.000Z");
    // One minute before → this Sunday
    expect(nextReportTime(new Date("2026-11-14T22:59:00Z")).toISOString()).toBe("2026-11-14T23:00:00.000Z");
  });

  it("handles month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStartOf("2027-01-02")).toBe("2026-12-27");
    expect(datesBetween("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(kstMidnightUtc("2026-11-08").toISOString()).toBe("2026-11-07T15:00:00.000Z");
  });

  it("knows the Pacific date YouTube uses (including DST)", () => {
    expect(pacificDate(new Date("2026-11-14T23:00:00Z"))).toBe("2026-11-14"); // PST
    expect(pacificDate(new Date("2026-07-01T06:30:00Z"))).toBe("2026-06-30"); // PDT
  });
});
