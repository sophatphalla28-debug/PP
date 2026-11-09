import { db } from "@/lib/db";
import { hasCronSecret } from "@/lib/auth";
import { getConfigStatus } from "@/lib/env";
import * as repo from "@/lib/repo";
import { generateAndStoreReport, syncEverything } from "@/lib/service";
import { dayOfWeek, kstDate, lastCompletedWeekStart } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily job (Vercel Cron, 22:00 UTC = 07:00 KST). Refreshes every channel, then on Sundays (KST)
 * builds the report for the week that just ended, so it is ready by 08:00 KST.
 */
export async function GET(request: Request) {
  if (!getConfigStatus().ok) return Response.json({ error: "not configured" }, { status: 503 });
  if (!hasCronSecret(request)) return new Response("Unauthorized", { status: 401 });

  const sql = await db();
  const now = new Date();
  const sync = await syncEverything(sql, "cron", 240_000);

  const week = lastCompletedWeekStart(now);
  let report: string | null = null;
  if (dayOfWeek(kstDate(now)) === 0 || !(await repo.getReport(sql, week))) {
    await generateAndStoreReport(sql, { weekStart: week, trigger: "cron", now });
    report = week;
  }
  return Response.json({
    sync: { status: sync.status, ok: sync.results.filter((r) => r.ok).length, failed: sync.results.filter((r) => !r.ok).length, skipped: sync.skipped.length, stoppedReason: sync.stoppedReason ?? null },
    reportGeneratedFor: report,
  });
}
