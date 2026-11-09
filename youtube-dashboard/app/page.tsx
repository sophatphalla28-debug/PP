import Link from "next/link";
import { Plus, Tv } from "lucide-react";
import { db } from "@/lib/db";
import { getConfigStatus } from "@/lib/env";
import { requireOwner } from "@/lib/auth";
import * as repo from "@/lib/repo";
import { loadSeries, loadWeekSummary } from "@/lib/service";
import {
  addDays,
  currentWeekStart,
  formatKstDateTime,
  formatWeek,
  isDateStr,
  lastCompletedWeekStart,
  nextReportTime,
  weekStartOf,
} from "@/lib/time";
import { AppShell } from "@/components/AppShell";
import { SetupRequired } from "@/components/SetupRequired";
import { SyncButton } from "@/components/SyncButton";
import { FilterBar } from "@/components/FilterBar";
import { KpiRow } from "@/components/KpiRow";
import { Highlights } from "@/components/Highlights";
import { DataNotices } from "@/components/Notices";
import { ChannelTable } from "@/components/ChannelTable";
import { CompareBarsChart, GrowthChart, TopChannels, ViewsTrendChart } from "@/components/Charts";
import { TopVideos } from "@/components/TopVideos";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the "Sync now" server action runs within this page

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DashboardPage({ searchParams }: { searchParams: Search }) {
  const config = getConfigStatus();
  if (!config.ok) return <SetupRequired problems={config.problems} />;
  const owner = await requireOwner();
  const sp = await searchParams;
  const sql = await db();
  const now = new Date();

  const current = currentWeekStart(now);
  const requested = one(sp.week);
  const week = isDateStr(requested) && weekStartOf(requested) <= current ? weekStartOf(requested) : lastCompletedWeekStart(now);
  const filter = (one(sp.channels) ?? "").split(",").filter(Boolean);
  const range = [8, 12, 26].includes(Number(one(sp.range))) ? Number(one(sp.range)) : 12;

  const { summary: s, channels } = await loadWeekSummary(sql, { weekStart: week, now, channelIds: filter });
  const lastRun = await repo.latestSyncRun(sql);

  if (!channels.length) {
    return (
      <AppShell active="/" email={owner.email}>
        <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
          <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-wash text-accent">
            <Tv size={22} aria-hidden />
          </span>
          <h1 className="text-lg font-semibold">Connect your first YouTube channel</h1>
          <p className="mt-2 text-sm text-ink-2">
            You&apos;ll sign in with the Google account (or Brand Account) that owns the channel and grant read-only access.
            The last 12 weeks of history load immediately. Repeat for each channel — they can be on different Google accounts.
          </p>
          <Link href="/api/auth/connect" className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white">
            <Plus size={16} aria-hidden /> Connect a channel
          </Link>
        </div>
      </AppShell>
    );
  }

  const selectedIds = s.channels.map((c) => c.channel.id);
  const series = await loadSeries(sql, selectedIds, current, range);
  const earliest = (await repo.earliestStatDay(sql)) ?? current;
  const weeks = [];
  for (let w = current; w >= weekStartOf(earliest) && weeks.length < 104; w = addDays(w, -7)) {
    weeks.push({ value: w, label: w === current ? `This week (in progress) · ${formatWeek(w)}` : formatWeek(w) });
  }
  const partial = !s.completeness.complete;

  return (
    <AppShell active="/" email={owner.email} actions={<SyncButton />}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{s.label}</h1>
            <p className="text-sm text-muted">
              {s.channels.length} of {channels.length} channels · Korea time (Sun–Sat)
              {lastRun?.finishedAt ? ` · Last synced ${formatKstDateTime(lastRun.finishedAt)}` : ""} · Next report{" "}
              {formatKstDateTime(nextReportTime(now))}
            </p>
          </div>
          <FilterBar
            weeks={weeks}
            week={week}
            channels={channels.map((c) => ({ id: c.id, title: c.title, thumbnailUrl: c.thumbnailUrl }))}
            selected={filter}
            range={range}
          />
        </div>

        <DataNotices s={s} />
        <KpiRow s={s} />
        <Highlights s={s} />
        <ChannelTable rows={s.channels} partial={partial} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ViewsTrendChart points={series} selectedWeek={week} />
          <TopChannels
            rows={s.channels.map((c) => ({ id: c.channel.id, name: c.channel.title, thumbnailUrl: c.channel.thumbnailUrl, views: c.views, growth: c.growthPct }))}
          />
          <CompareBarsChart
            title="Views by channel"
            subtitle="This week vs last week"
            unit="views"
            partial={partial}
            rows={s.channels.filter((c) => c.daysAvailable > 0).map((c) => ({ id: c.channel.id, name: c.channel.title, current: c.views, previous: c.lastSameDays.views }))}
          />
          <GrowthChart partial={partial} rows={s.channels.map((c) => ({ id: c.channel.id, name: c.channel.title, growth: c.growthPct }))} />
          <div className="lg:col-span-2">
            <CompareBarsChart
              title="Subscriber growth by channel"
              subtitle="New subscribers this week vs last week"
              unit="subscribers"
              partial={partial}
              rows={s.channels
                .filter((c) => c.daysAvailable > 0)
                .map((c) => ({ id: c.channel.id, name: c.channel.title, current: c.subscribersGained, previous: c.lastSameDays.subscribersGained }))}
            />
          </div>
        </div>

        <TopVideos videos={s.topVideos} partial={partial} />

        <p className="text-xs text-muted">
          Source: YouTube Analytics API (views, watch time, subscribers) and YouTube Data API (uploads, lifetime totals). YouTube
          reports daily totals on Pacific-time days and publishes them with a 2–3 day delay; nothing here is estimated or filled in.
        </p>
      </div>
    </AppShell>
  );
}
