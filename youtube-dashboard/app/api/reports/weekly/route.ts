import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getOwner, hasCronSecret, isSameOrigin } from "@/lib/auth";
import { getConfigStatus } from "@/lib/env";
import * as repo from "@/lib/repo";
import { generateAndStoreReport, syncEverything } from "@/lib/service";
import { isDateStr, lastCompletedWeekStart, weekStartOf } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorised(request: Request, mutating: boolean): Promise<boolean> {
  if (hasCronSecret(request)) return true;
  if (!(await getOwner())) return false;
  return !mutating || (await isSameOrigin());
}

function pickWeek(request: NextRequest): string {
  const w = request.nextUrl.searchParams.get("week");
  return isDateStr(w) ? weekStartOf(w) : lastCompletedWeekStart(new Date());
}

function respond(request: NextRequest, body: { weekStart: string; markdown: string; [k: string]: unknown }) {
  if (request.nextUrl.searchParams.get("format") === "md") {
    return new Response(body.markdown, { headers: { "content-type": "text/markdown; charset=utf-8" } });
  }
  return Response.json(body);
}

/**
 * POST — refresh all channels, then (re)generate the report. Used by the Sunday 08:00 KST
 * Claude scheduled task:  curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/reports/weekly?format=md"
 * Query: ?week=YYYY-MM-DD (any day in the week; default = last completed KST week), ?sync=0 to skip the refresh.
 */
export async function POST(request: NextRequest) {
  if (!getConfigStatus().ok) return Response.json({ error: "not configured" }, { status: 503 });
  if (!(await authorised(request, true))) return new Response("Unauthorized", { status: 401 });
  const sql = await db();
  const now = new Date();
  const weekStart = pickWeek(request);
  const sync = request.nextUrl.searchParams.get("sync") === "0" ? null : await syncEverything(sql, "report", 200_000);
  const { report, markdown } = await generateAndStoreReport(sql, { weekStart, trigger: hasCronSecret(request) ? "scheduled" : "manual", now });
  return respond(request, {
    weekStart,
    markdown,
    sync: sync && {
      status: sync.status,
      failed: sync.results.filter((r) => !r.ok).map((r) => ({ channel: r.title, error: r.error })),
      skipped: sync.skipped,
      stoppedReason: sync.stoppedReason ?? null,
    },
    report,
  });
}

/** GET — the stored report for a week (default: last completed week), without refreshing. */
export async function GET(request: NextRequest) {
  if (!getConfigStatus().ok) return Response.json({ error: "not configured" }, { status: 503 });
  if (!(await authorised(request, false))) return new Response("Unauthorized", { status: 401 });
  const sql = await db();
  const weekStart = pickWeek(request);
  const stored = await repo.getReport(sql, weekStart);
  if (!stored) return Response.json({ error: `No report stored for week starting ${weekStart}` }, { status: 404 });
  return respond(request, { weekStart, markdown: stored.markdown, generatedAt: stored.generatedAt, trigger: stored.trigger });
}
