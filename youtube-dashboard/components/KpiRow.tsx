import type { WeekSummary } from "@/lib/metrics";
import { fmtCompact, fmtHours, fmtInt, fmtPct, fmtSigned } from "@/lib/format";
import { Delta, cx } from "./ui";

function Tile({
  label,
  value,
  children,
  hero,
}: {
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
  hero?: boolean;
}) {
  return (
    <div className={cx("card flex flex-col gap-1 p-4", hero && "col-span-2 sm:col-span-1 lg:col-span-2")}>
      <span className="text-sm text-ink-2">{label}</span>
      <span className={cx("font-semibold tracking-tight text-ink", hero ? "text-5xl" : "text-3xl")}>{value}</span>
      <div className="text-sm text-muted">{children}</div>
    </div>
  );
}

export function KpiRow({ s }: { s: WeekSummary }) {
  const t = s.totals;
  const partial = !s.completeness.complete;
  const vs = partial ? "vs same days last week" : "vs last week";
  const growthTone = t.growthPct === null ? "text-muted" : t.growthPct > 0.5 ? "text-good-text" : t.growthPct < -0.5 ? "text-bad-text" : "text-ink";
  return (
    <section aria-label="Overall performance" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <Tile label="Views this week" value={fmtInt(t.views)} hero>
        <Delta pct={t.growthPct} suffix={vs} />
      </Tile>
      <Tile label="Weekly growth" value={<span className={growthTone}>{fmtPct(t.growthPct)}</span>}>
        {fmtInt(t.lastSameDays.views)} views {partial ? "same days " : ""}last week
      </Tile>
      <Tile label="Subscribers gained" value={fmtCompact(t.subscribersGained)}>
        <Delta pct={t.subscribersGrowthPct} /> <span className="ml-1">net {fmtSigned(t.subscribersGained - t.subscribersLost)}</span>
      </Tile>
      <Tile label="Watch hours" value={fmtHours(t.watchHours)}>
        <Delta pct={t.watchHoursGrowthPct} />
      </Tile>
      <Tile label="Videos uploaded" value={fmtInt(t.uploads)}>
        {fmtInt(t.uploadsLast)} last week
      </Tile>
      <Tile label="Total subscribers" value={t.lifetimeSubscribers === null ? "n/a" : fmtCompact(t.lifetimeSubscribers)}>
        <span title="Lifetime public views across the selected channels">
          {t.lifetimeViews === null ? "Lifetime views n/a" : `${fmtCompact(t.lifetimeViews)} lifetime views`}
        </span>
        {t.channelsWithHiddenSubscribers ? <span className="block text-xs">{t.channelsWithHiddenSubscribers} hidden count excluded</span> : null}
      </Tile>
    </section>
  );
}
