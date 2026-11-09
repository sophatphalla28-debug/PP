"use client";

import { ArrowDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChannelWeek } from "@/lib/metrics";
import { fmtHours, fmtInt, videoUrl } from "@/lib/format";
import { Avatar, ConnectionBadge, Delta, StatusBadge, cx } from "./ui";

type SortKey = "views" | "growth" | "subs" | "watch";

const SORTERS: Record<SortKey, (c: ChannelWeek) => number> = {
  views: (c) => c.views,
  growth: (c) => c.growthPct ?? Number.NEGATIVE_INFINITY,
  subs: (c) => c.subscribersGained,
  watch: (c) => c.watchHours,
};

function HeaderCell({
  k,
  children,
  className,
  sort,
  onSort,
}: {
  k?: SortKey;
  children: React.ReactNode;
  className?: string;
  sort: SortKey;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th scope="col" className={cx("px-3 py-2.5 text-xs font-medium text-muted", className)} aria-sort={k && sort === k ? "descending" : undefined}>
      {k ? (
        <button type="button" onClick={() => onSort(k)} className={cx("inline-flex items-center gap-1 hover:text-ink", sort === k && "text-ink")}>
          {children}
          {sort === k ? <ArrowDown size={12} aria-hidden /> : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function ChannelTable({ rows, partial }: { rows: ChannelWeek[]; partial: boolean }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("views");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => r.channel.title.toLowerCase().includes(q)).sort((a, b) => SORTERS[sort](b) - SORTERS[sort](a));
  }, [rows, query, sort]);

  const lastLabel = partial ? "Views last week (same days)" : "Views last week";

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Channel performance</h2>
          <p className="text-sm text-muted">Every connected channel, this week vs last week</p>
        </div>
        <label className="relative flex items-center">
          <span className="sr-only">Search channels</span>
          <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels"
            className="h-9 w-56 rounded-lg border border-line bg-page pl-8 pr-2 text-sm text-ink placeholder:text-muted"
          />
        </label>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/60 text-left">
            <tr>
              <HeaderCell sort={sort} onSort={setSort}>Channel</HeaderCell>
              <HeaderCell k="views" className="text-right" sort={sort} onSort={setSort}>Views this week</HeaderCell>
              <HeaderCell className="text-right" sort={sort} onSort={setSort}>{lastLabel}</HeaderCell>
              <HeaderCell k="growth" className="text-right" sort={sort} onSort={setSort}>Growth</HeaderCell>
              <HeaderCell k="subs" className="text-right" sort={sort} onSort={setSort}>Subs gained</HeaderCell>
              <HeaderCell k="watch" className="text-right" sort={sort} onSort={setSort}>Watch hours</HeaderCell>
              <HeaderCell sort={sort} onSort={setSort}>Best video</HeaderCell>
              <HeaderCell sort={sort} onSort={setSort}>Status</HeaderCell>
            </tr>
          </thead>
          <tbody className="tabular">
            {shown.map((r) => (
              <tr key={r.channel.id} className="border-t border-line">
                <td className="px-3 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar src={r.channel.thumbnailUrl} name={r.channel.title} />
                    <div className="min-w-0">
                      <p className="max-w-[14rem] truncate font-medium text-ink" title={r.channel.title}>
                        {r.channel.title}
                      </p>
                      <ConnectionBadge status={r.channel.status} />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-medium text-ink">
                  {r.daysAvailable ? fmtInt(r.views) : <span className="text-muted">Pending</span>}
                  {r.daysAvailable > 0 && r.daysAvailable < 7 ? <span className="block text-xs font-normal text-muted">{r.daysAvailable}/7 days</span> : null}
                </td>
                <td className="px-3 py-3 text-right text-ink-2">{r.daysAvailable ? fmtInt(r.lastSameDays.views) : fmtInt(r.lastFullWeek.views)}</td>
                <td className="px-3 py-3 text-right">
                  <Delta pct={r.growthPct} />
                </td>
                <td className="px-3 py-3 text-right text-ink-2">{fmtInt(r.subscribersGained)}</td>
                <td className="px-3 py-3 text-right text-ink-2">{fmtHours(r.watchHours)}</td>
                <td className="max-w-[16rem] px-3 py-3">
                  {r.bestVideo ? (
                    <a href={videoUrl(r.bestVideo.videoId)} target="_blank" rel="noreferrer" className="block truncate text-ink hover:underline" title={r.bestVideo.title}>
                      {r.bestVideo.title}
                      <span className="block text-xs text-muted">{fmtInt(r.bestVideo.views)} views</span>
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-line md:hidden">
        {shown.map((r) => (
          <li key={r.channel.id} className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Avatar src={r.channel.thumbnailUrl} name={r.channel.title} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{r.channel.title}</p>
                <ConnectionBadge status={r.channel.status} />
              </div>
              <StatusBadge status={r.status} />
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm tabular">
              <div>
                <dt className="text-xs text-muted">This week</dt>
                <dd className="font-medium">{r.daysAvailable ? fmtInt(r.views) : "Pending"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Last week{partial ? "*" : ""}</dt>
                <dd>{fmtInt(r.daysAvailable ? r.lastSameDays.views : r.lastFullWeek.views)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Growth</dt>
                <dd>
                  <Delta pct={r.growthPct} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Subs gained</dt>
                <dd>{fmtInt(r.subscribersGained)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Watch hours</dt>
                <dd>{fmtHours(r.watchHours)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Days</dt>
                <dd>{r.daysAvailable}/7</dd>
              </div>
            </dl>
            {r.bestVideo ? (
              <a href={videoUrl(r.bestVideo.videoId)} target="_blank" rel="noreferrer" className="mt-2 block truncate text-sm text-ink-2 underline-offset-2 hover:underline">
                Best: {r.bestVideo.title} · {fmtInt(r.bestVideo.views)} views
              </a>
            ) : null}
          </li>
        ))}
        {partial ? <li className="px-4 py-2 text-xs text-muted">* Same days as this week&apos;s published data.</li> : null}
      </ul>
      {!shown.length ? <p className="px-4 py-6 text-sm text-muted">No channels match “{query}”.</p> : null}
    </div>
  );
}
