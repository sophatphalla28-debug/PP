import { ExternalLink, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getConfigStatus } from "@/lib/env";
import { requireOwner } from "@/lib/auth";
import * as repo from "@/lib/repo";
import { channelUrl } from "@/lib/format";
import { formatDay, formatKstDateTime, pacificDate } from "@/lib/time";
import { AppShell } from "@/components/AppShell";
import { SetupRequired } from "@/components/SetupRequired";
import { SyncButton } from "@/components/SyncButton";
import { RemoveChannelButton } from "@/components/RemoveChannelButton";
import { Avatar, ConnectionBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = { title: "Channels" };

const ERRORS: Record<string, string> = {
  denied: "Connection cancelled — no access was granted.",
  scopes: "Both read-only permissions are needed (YouTube account + YouTube Analytics). Please connect again and leave both boxes ticked.",
  no_refresh: "Google didn't return a long-lived authorization. Remove the app in your Google Account → Security → Third-party connections, then connect again.",
  no_channel: "That Google account has no YouTube channel. Connect again and pick the account or Brand Account that owns the channel.",
  google: "Google returned an error while connecting. Please try again.",
  expired: "The connection link expired. Please try again.",
};

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string; removed?: string; revoked?: string }> }) {
  const config = getConfigStatus();
  if (!config.ok) return <SetupRequired problems={config.problems} />;
  const owner = await requireOwner();
  const { connected, error, removed, revoked } = await searchParams;
  const sql = await db();
  const [channels, quota, lastRun] = await Promise.all([
    repo.listChannels(sql),
    repo.getQuotaUsage(sql, pacificDate(new Date())),
    repo.latestSyncRun(sql),
  ]);

  return (
    <AppShell active="/channels" email={owner.email} actions={<SyncButton label="Sync all" />}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
            <p className="text-sm text-muted">
              {channels.length} connected · data refreshes daily at 07:00 KST
              {lastRun?.finishedAt ? ` · last sync ${formatKstDateTime(lastRun.finishedAt)} (${lastRun.status})` : ""}
            </p>
          </div>
          <a href="/api/auth/connect" className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white">
            <Plus size={16} aria-hidden /> Connect a channel
          </a>
        </div>

        {connected ? (
          <p role="status" className="rounded-xl border border-line bg-good-wash px-4 py-2.5 text-sm">
            Connected <strong>{connected}</strong>. History for the last 12 weeks has been loaded.
          </p>
        ) : null}
        {removed ? (
          <p role="status" className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm">
            Channel removed: <strong>{removed}</strong>. Its stored statistics were deleted
            {revoked === "1"
              ? " and the dashboard's Google access was revoked."
              : ". Google access couldn't be revoked automatically — remove it in your Google Account → Security → Third-party connections."}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-xl border border-line bg-bad-wash px-4 py-2.5 text-sm">
            {ERRORS[error] ?? ERRORS.google}
          </p>
        ) : null}

        <ul className="card divide-y divide-line">
          {channels.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar src={c.thumbnailUrl} name={c.title} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={channelUrl(c.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-ink hover:underline">
                    {c.title}
                    <ExternalLink size={12} aria-hidden className="text-muted" />
                  </a>
                  <ConnectionBadge status={c.status} />
                </div>
                <p className="text-xs text-muted">
                  {c.customUrl ? `${c.customUrl} · ` : ""}via {c.googleEmail ?? "Google account"} ·{" "}
                  {c.lastSyncedAt ? `synced ${formatKstDateTime(c.lastSyncedAt)}` : "not synced yet"}
                  {c.dataThrough ? ` · YouTube data through ${formatDay(c.dataThrough)}` : ""}
                </p>
                {c.lastError ? <p className="mt-1 text-xs text-bad-text">{c.lastError}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.status === "needs_reauth" ? (
                  <a href="/api/auth/connect" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-medium text-white">
                    <RotateCcw size={13} aria-hidden /> Reconnect
                  </a>
                ) : (
                  <SyncButton channelId={c.id} label="Sync" compact />
                )}
                <RemoveChannelButton id={c.id} title={c.title} />
              </div>
            </li>
          ))}
          {!channels.length ? <li className="px-4 py-8 text-center text-sm text-muted">No channels yet. Connect your first one above.</li> : null}
        </ul>

        <section className="card grid gap-4 p-4 text-sm text-ink-2 md:grid-cols-2">
          <div>
            <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
              <ShieldCheck size={15} aria-hidden /> How connecting works
            </h2>
            <ul className="ml-4 list-disc space-y-1">
              <li>Each channel is authorised separately, so channels can live on different Google accounts or Brand Accounts.</li>
              <li>In Google&apos;s window, choose the account that owns the channel. Access is read-only (statistics only — no uploading, editing or deleting).</li>
              <li>Authorisations are encrypted (AES-256-GCM) in your database and never sent to the browser.</li>
              <li>To reconnect an expired channel, click Reconnect and pick the same account.</li>
            </ul>
          </div>
          <div>
            <h2 className="mb-1 font-semibold text-ink">API usage today (Pacific time)</h2>
            <p>
              Data API: <strong className="tabular">{quota.data.toLocaleString("en-US")}</strong> of 10,000 daily units · Analytics API:{" "}
              <strong className="tabular">{quota.analytics.toLocaleString("en-US")}</strong> queries
            </p>
            <p className="mt-1 text-xs text-muted">
              A daily sync costs roughly 4 Data API units per channel, so hundreds of channels fit in the free quota. If the
              quota runs out, syncing pauses and resumes after midnight Pacific time.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
