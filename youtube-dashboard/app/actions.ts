"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireOwner } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { revokeToken } from "@/lib/google/oauth";
import * as repo from "@/lib/repo";
import { generateAndStoreReport, syncDepsFor } from "@/lib/service";
import { syncAll } from "@/lib/sync";
import { isDateStr, lastCompletedWeekStart, weekStartOf } from "@/lib/time";

export type ActionResult = { ok: boolean; message: string };

export async function syncNowAction(channelId?: string): Promise<ActionResult> {
  await requireOwner();
  const sql = await db();
  const run = await syncAll(syncDepsFor(sql), { trigger: "manual", onlyChannelId: channelId, timeBudgetMs: 240_000 });
  revalidatePath("/", "layout");
  const failed = run.results.filter((r) => !r.ok);
  if (!run.results.length) return { ok: false, message: "No channels to sync. Connect a channel first (disconnected channels need reconnecting)." };
  if (!failed.length && !run.skipped.length) return { ok: true, message: `Synced ${run.results.length} channel${run.results.length === 1 ? "" : "s"}.` };
  const parts = failed.map((f) => `${f.title}: ${f.error}`);
  if (run.stoppedReason) parts.push(run.stoppedReason);
  return { ok: failed.length < run.results.length, message: parts.join(" · ") };
}

export async function removeChannelAction(channelId: string): Promise<ActionResult & { revoked: boolean }> {
  await requireOwner();
  const sql = await db();
  const enc = await repo.deleteChannel(sql, channelId);
  let revoked = false;
  if (enc) {
    try {
      revoked = await revokeToken(decryptSecret(enc, env().TOKEN_ENCRYPTION_KEY, channelId));
    } catch {
      revoked = false;
    }
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    revoked,
    message: revoked
      ? "Channel removed and Google access revoked."
      : "Channel removed. Google access could not be revoked automatically — remove it in your Google Account → Security → Third-party connections.",
  };
}

export async function generateReportAction(week?: string): Promise<ActionResult & { weekStart?: string }> {
  await requireOwner();
  const sql = await db();
  const weekStart = isDateStr(week) ? weekStartOf(week) : lastCompletedWeekStart(new Date());
  await generateAndStoreReport(sql, { weekStart, trigger: "manual", now: new Date() });
  revalidatePath("/reports");
  return { ok: true, message: "Report generated.", weekStart };
}
