import type { ChannelWeek, WeekSummary } from "./metrics";
import { fmtDuration, fmtHours, fmtInt, fmtPct, fmtSigned, plural, videoUrl } from "./format";
import { formatKstDateTime } from "./time";

/**
 * Turns a WeekSummary into the plain-English weekly report. Recommendations are rule-based and
 * quote the underlying numbers, so every sentence can be traced to stored YouTube data.
 */

export type WeeklyReport = {
  weekStart: string;
  label: string;
  generatedAt: string;
  summary: WeekSummary;
  actionPlan: string[];
  executiveSummary: string;
};

const quote = (s: string) => `“${s}”`;

function names(list: ChannelWeek[]): string {
  const t = list.map((c) => c.channel.title);
  if (t.length <= 2) return t.join(" and ");
  return `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
}

const viewsLine = (c: ChannelWeek) => `${fmtInt(c.comparable.last.views)} → ${fmtInt(c.comparable.this.views)} views`;

export function buildActionPlan(s: WeekSummary): string[] {
  const recs: string[] = [];
  const { fastestGrowing: up, biggestDecline: down, bestVideo } = s.highlights;

  const disconnected = s.channels.filter((c) => c.channel.status === "needs_reauth");
  if (disconnected.length) {
    recs.push(
      `Reconnect ${names(disconnected)} on the Channels page. ${disconnected.length === 1 ? "Its" : "Their"} ` +
        `Google access expired or was revoked, so new data is not being collected.`,
    );
  }

  if (up && up.growthPct !== null && up.growthPct >= 5) {
    const target = Math.max(up.uploads + 1, 2);
    const follow = up.bestVideo ? ` Make a follow-up to ${quote(up.bestVideo.title)} (${fmtInt(up.bestVideo.views)} views this week).` : "";
    recs.push(
      `Double down on ${up.channel.title}: views grew ${fmtPct(up.growthPct)} (${viewsLine(up)}) with ` +
        `${plural(up.uploads, "new video")}. Schedule at least ${target} uploads there next week.${follow}`,
    );
  }

  if (down && down.growthPct !== null && down.growthPct <= -5) {
    const why =
      down.uploads < down.uploadsLast
        ? `It published ${plural(down.uploads, "video")} versus ${fmtInt(down.uploadsLast)} the week before, so restore the upload schedule first.`
        : `Uploads held steady (${fmtInt(down.uploads)}), so open YouTube Studio → Analytics → Reach and check whether impressions or click-through rate dropped on the latest thumbnails.`;
    recs.push(`Investigate ${down.channel.title}: views fell ${fmtPct(down.growthPct)} (${viewsLine(down)}). ${why}`);
  }

  if (bestVideo && recs.length < 3) {
    const others = s.channels.filter((c) => c.channel.id !== bestVideo.channelId && c.daysAvailable > 0);
    const weakest = others.length ? others.reduce((a, b) => ((a.growthPct ?? 0) <= (b.growthPct ?? 0) ? a : b)) : null;
    const where = weakest ? `on ${weakest.channel.title}` : "in your next upload";
    recs.push(
      `Study ${quote(bestVideo.title)} on ${bestVideo.channelTitle}: ${fmtInt(bestVideo.views)} views, ` +
        `${fmtHours(bestVideo.watchMinutes / 60)} watch hours, ${fmtDuration(bestVideo.averageViewDurationSeconds)} average view duration. ` +
        `Reuse its topic angle, title structure and thumbnail style ${where}.`,
    );
  }

  const idle = s.channels.filter((c) => c.uploads === 0 && c.channel.status !== "needs_reauth");
  if (recs.length < 3 && idle.length && idle.length < s.channels.length) {
    recs.push(`Publish on ${names(idle.slice(0, 4))}${idle.length > 4 ? ` and ${idle.length - 4} more` : ""}: no new videos there this week.`);
  }

  if (recs.length < 3 && !s.completeness.complete && s.completeness.maxDays > 0) {
    recs.push(
      `Re-check the dashboard on Tuesday. YouTube publishes the last days of each week with a 2–3 day delay, ` +
        `so this week's final totals will still rise.`,
    );
  }

  const fallbacks: string[] = [];
  fallbacks.push(
    s.totals.uploads > 0
      ? `Keep the cadence: ${plural(s.totals.uploads, "video")} went out across your channels this week (${fmtInt(s.totals.uploadsLast)} the week before). Aim to match or beat it.`
      : `No videos were published this week across your channels. Pick your best-performing channel and schedule at least one upload.`,
  );
  const leader = s.highlights.highestViewed;
  if (leader) {
    fallbacks.push(
      `Test one new idea on ${leader.channel.title} (${fmtInt(leader.views)} views this week, ${fmtPct(leader.growthPct)}): ` +
        `try a fresh topic angle or thumbnail style on the next upload and compare its first-week views with this week's average.`,
    );
  }
  fallbacks.push(
    `Open YouTube Studio → Analytics → Engagement for your newest video and check where viewers drop off; tighten the first 30 seconds of the next one.`,
  );
  for (const f of fallbacks) if (recs.length < 3) recs.push(f);
  return recs.slice(0, 3);
}

export function buildExecutiveSummary(s: WeekSummary): string {
  const t = s.totals;
  const active = s.channels.filter((c) => c.daysAvailable > 0);
  if (!active.length) {
    return "YouTube has not published any data for this week yet, so there is nothing to compare. The dashboard will fill in automatically.";
  }
  const growthText = t.growthPct === null ? "with no earlier week to compare against" : `${fmtPct(t.growthPct)} versus the same days last week`;
  const parts = [
    `Across ${plural(active.length, "channel")} you earned ${fmtInt(t.views)} views (${growthText}), ` +
      `${fmtHours(t.watchHours)} watch hours and ${fmtInt(t.subscribersGained)} new subscribers from ${plural(t.uploads, "new video")}.`,
  ];
  const { fastestGrowing: up, biggestDecline: down, needsAttention } = s.highlights;
  if (up) parts.push(`${up.channel.title} led the growth (${fmtPct(up.growthPct)}).`);
  if (down) parts.push(`${down.channel.title} slipped the most (${fmtPct(down.growthPct)}).`);
  if (needsAttention && needsAttention.channel !== down) parts.push(`${needsAttention.channel.channel.title} needs attention: ${needsAttention.reason}`);
  if (!s.completeness.complete) parts.push("Some days are still pending from YouTube, so totals will rise slightly as the data lands.");
  return parts.join(" ");
}

export function buildReport(s: WeekSummary, generatedAt: Date): WeeklyReport {
  return {
    weekStart: s.weekStart,
    label: s.label,
    generatedAt: generatedAt.toISOString(),
    summary: s,
    actionPlan: buildActionPlan(s),
    executiveSummary: buildExecutiveSummary(s),
  };
}

function channelBlock(c: ChannelWeek): string[] {
  const lines = [`### ${c.channel.title}`];
  if (c.channel.status === "needs_reauth") lines.push("- ⚠ Disconnected — reconnect to resume data collection.");
  if (c.daysAvailable === 0) {
    lines.push("- This week's views: not yet available from YouTube");
    lines.push(`- Last week's views: ${fmtInt(c.lastFullWeek.views)}`);
    return lines;
  }
  const partial = c.daysAvailable < 7;
  lines.push(`- This week's views: ${fmtInt(c.views)}${partial ? ` (${c.daysAvailable} of 7 days published)` : ""}`);
  lines.push(`- Last week's views: ${fmtInt(c.lastSameDays.views)}${partial ? " (same days)" : ""}`);
  lines.push(`- Growth: ${c.growthPct === null ? "n/a (no views last week to compare)" : fmtPct(c.growthPct)}`);
  lines.push(`- New subscribers: ${fmtInt(c.subscribersGained)} (net ${fmtSigned(c.subscribersGained - c.subscribersLost)})`);
  lines.push(`- Watch hours: ${fmtHours(c.watchHours)}`);
  lines.push(`- Videos published: ${fmtInt(c.uploads)}`);
  if (c.bestVideo) lines.push(`- Best video: ${quote(c.bestVideo.title)} — ${fmtInt(c.bestVideo.views)} views`);
  return lines;
}

export function renderMarkdown(r: WeeklyReport, opts: { dashboardUrl?: string } = {}): string {
  const s = r.summary;
  const t = s.totals;
  const h = s.highlights;
  const out: string[] = [];
  out.push("# MY YOUTUBE WEEKLY REPORT", "", `**Week:** ${s.label} (Korea time)`, "");
  if (s.completeness.note) out.push(`> **Data note:** ${s.completeness.note}`, "");

  out.push("## OVERALL PERFORMANCE");
  out.push(`- Total views: ${fmtInt(t.views)}`);
  out.push(`- Total subscribers gained: ${fmtInt(t.subscribersGained)} (net ${fmtSigned(t.subscribersGained - t.subscribersLost)})`);
  out.push(`- Total watch hours: ${fmtHours(t.watchHours)}`);
  out.push(`- New videos published: ${fmtInt(t.uploads)}`);
  out.push(`- Weekly growth: ${t.growthPct === null ? "n/a (no comparable data last week)" : fmtPct(t.growthPct)}`);
  if (t.lifetimeSubscribers !== null) {
    out.push(`- Total subscribers (all channels): ${fmtInt(t.lifetimeSubscribers)}${t.channelsWithHiddenSubscribers ? ` (excludes ${plural(t.channelsWithHiddenSubscribers, "channel")} with hidden counts)` : ""}`);
  }
  out.push("");

  out.push("## TOP 5 CHANNELS (by views)");
  const ranked = s.channels.filter((c) => c.daysAvailable > 0).slice(0, 5);
  if (!ranked.length) out.push("No channel data published yet for this week.");
  ranked.forEach((c, i) => out.push(`${i + 1}. **${c.channel.title}** — ${fmtInt(c.views)} views (${fmtPct(c.growthPct)})`));
  out.push("");

  out.push("## CHANNEL PERFORMANCE");
  for (const c of s.channels) out.push(...channelBlock(c), "");

  out.push("## WINNERS AND LOSERS");
  out.push(`- Fastest-growing channel: ${h.fastestGrowing ? `${h.fastestGrowing.channel.title} (${fmtPct(h.fastestGrowing.growthPct)}, ${viewsLine(h.fastestGrowing)})` : "none grew this week"}`);
  out.push(`- Biggest declining channel: ${h.biggestDecline ? `${h.biggestDecline.channel.title} (${fmtPct(h.biggestDecline.growthPct)}, ${viewsLine(h.biggestDecline)})` : "no channel declined"}`);
  out.push(`- Highest-viewed channel: ${h.highestViewed ? `${h.highestViewed.channel.title} (${fmtInt(h.highestViewed.views)} views)` : "n/a"}`);
  out.push(`- Most new subscribers: ${h.mostSubscribers ? `${h.mostSubscribers.channel.title} (+${fmtInt(h.mostSubscribers.subscribersGained)})` : "n/a"}`);
  out.push(
    `- Most successful video: ${h.bestVideo ? `${quote(h.bestVideo.title)} on ${h.bestVideo.channelTitle} — ${fmtInt(h.bestVideo.views)} views — ${videoUrl(h.bestVideo.videoId)}` : "n/a (no video data yet)"}`,
  );
  out.push(`- Channel that needs attention: ${h.needsAttention ? `${h.needsAttention.channel.channel.title} — ${h.needsAttention.reason}` : "none — every channel is stable or growing"}`);
  out.push("");

  out.push("## MY ACTION PLAN");
  r.actionPlan.forEach((a, i) => out.push(`${i + 1}. ${a}`));
  out.push("");

  out.push("## EXECUTIVE SUMMARY", r.executiveSummary, "");
  out.push("---");
  out.push(
    `_Generated ${formatKstDateTime(new Date(r.generatedAt))} from the YouTube Analytics API. ` +
      `YouTube reports daily totals on Pacific-time days.${opts.dashboardUrl ? ` Dashboard: ${opts.dashboardUrl}` : ""}_`,
  );
  return out.join("\n");
}
