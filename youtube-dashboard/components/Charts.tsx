"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeeklyPoint } from "@/lib/metrics";
import { fmtCompact, fmtHours, fmtInt, fmtPct } from "@/lib/format";
import { cx } from "./ui";

const AXIS = { stroke: "var(--axis)", tickLine: false } as const;
const TICK = { fill: "var(--muted)", fontSize: 12 };

function ChartCard({ title, subtitle, action, legend, children }: { title: string; subtitle?: string; action?: React.ReactNode; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="card flex min-w-0 flex-col p-4">
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </figcaption>
      {legend}
      {children}
    </figure>
  );
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string; dashed?: boolean }[] }) {
  return (
    <div className="card min-w-40 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color ? <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} /> : null}
          <span className="font-semibold text-ink tabular">{r.value}</span>
          <span className="text-ink-2">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

const truncate = (s: string, n = 18) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Channel-name axis label on one line (Recharts would otherwise wrap long names). */
function CategoryTick(props: { x?: number | string; y?: number | string; payload?: { value: string } }) {
  const { x = 0, y = 0, payload } = props;
  return (
    <text x={Number(x) - 6} y={Number(y)} dy={4} textAnchor="end" fill="var(--muted)" fontSize={12}>
      <title>{payload?.value}</title>
      {truncate(payload?.value ?? "")}
    </text>
  );
}

/* ── Total views over time ─────────────────────────────────────────── */

export function ViewsTrendChart({ points, selectedWeek }: { points: WeeklyPoint[]; selectedWeek: string }) {
  const [table, setTable] = useState(false);
  const selected = points.find((p) => p.weekStart === selectedWeek);
  const last = points[points.length - 1];
  return (
    <ChartCard
      title="Total views over time"
      subtitle="Weekly views across the selected channels (Sun–Sat, Korea time). Hollow points = days still pending from YouTube."
      action={
        <button type="button" onClick={() => setTable((t) => !t)} className="rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:text-ink">
          {table ? "Show chart" : "Show table"}
        </button>
      }
    >
      {table ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1.5 font-medium">Week of</th>
                <th className="py-1.5 text-right font-medium">Views</th>
                <th className="py-1.5 text-right font-medium">Watch hours</th>
                <th className="py-1.5 text-right font-medium">Subs gained</th>
                <th className="py-1.5 text-right font-medium">Days</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.weekStart} className="border-t border-line">
                  <td className="py-1.5">{p.label}</td>
                  <td className="py-1.5 text-right">{fmtInt(p.views)}</td>
                  <td className="py-1.5 text-right">{fmtHours(p.watchHours)}</td>
                  <td className="py-1.5 text-right">{fmtInt(p.subscribersGained)}</td>
                  <td className="py-1.5 text-right text-muted">{p.days}/7</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : points.length ? (
        <div className="h-72" role="img" aria-label={`Weekly views. Latest week ${last?.label}: ${fmtInt(last?.views ?? 0)} views.`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 20, right: 28, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...AXIS} tick={TICK} minTickGap={16} />
              <YAxis {...AXIS} axisLine={false} tick={TICK} width={52} tickFormatter={(v: number) => fmtCompact(v)} allowDecimals={false} />
              {selected ? <ReferenceLine x={selected.label} stroke="var(--axis)" /> : null}
              <Tooltip
                cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload as WeeklyPoint | undefined;
                  if (!p) return null;
                  return (
                    <TooltipBox
                      title={`Week of ${p.label}${p.partial ? ` · ${p.days}/7 days published` : ""}`}
                      rows={[
                        { label: "views", value: fmtInt(p.views), color: "var(--accent)" },
                        { label: "watch hours", value: fmtHours(p.watchHours) },
                        { label: "subscribers gained", value: fmtInt(p.subscribersGained) },
                      ]}
                    />
                  );
                }}
              />
              <Area
                type="linear"
                dataKey="views"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="var(--accent)"
                fillOpacity={0.1}
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; index?: number; payload?: WeeklyPoint }) => {
                  const { cx: x, cy: y, payload, index } = props;
                  if (x === undefined || y === undefined || !payload) return <g key={index} />;
                  return (
                    <circle
                      key={payload.weekStart}
                      cx={x}
                      cy={y}
                      r={4}
                      fill={payload.partial ? "var(--surface)" : "var(--accent)"}
                      stroke={payload.partial ? "var(--accent)" : "var(--surface)"}
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
              >
                <LabelList
                  dataKey="views"
                  content={(props) => {
                    const { x, y, index } = props as { x?: number; y?: number; index?: number };
                    if (index !== points.length - 1 || x === undefined || y === undefined) return null;
                    return (
                      <text x={Number(x)} y={Number(y) - 10} textAnchor="end" fill="var(--ink)" fontSize={12} fontWeight={600}>
                        {fmtCompact(points[index].views)}
                      </text>
                    );
                  }}
                />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted">No history yet.</p>
      )}
    </ChartCard>
  );
}

/* ── This week vs last week, per channel ──────────────────────────── */

export type CompareRow = { id: string; name: string; current: number; previous: number };

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

export function CompareBarsChart({
  title,
  subtitle,
  rows,
  unit,
  partial,
}: {
  title: string;
  subtitle: string;
  rows: CompareRow[];
  unit: string;
  partial: boolean;
}) {
  const data = [...rows].sort((a, b) => b.current - a.current);
  const height = Math.max(120, data.length * 44 + 36);
  const prevLabel = partial ? "Last week (same days)" : "Last week";
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      legend={
        <div className="mb-2 flex flex-wrap gap-4">
          <Swatch color="var(--accent)" label="This week" />
          <Swatch color="var(--accent-soft)" label={prevLabel} />
        </div>
      }
    >
      {data.length ? (
        <div style={{ height }} role="img" aria-label={`${title}: ${data.map((d) => `${d.name} ${fmtInt(d.current)} ${unit}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barGap={2} barCategoryGap={10}>
              <CartesianGrid horizontal={false} stroke="var(--grid)" />
              <XAxis type="number" {...AXIS} tick={TICK} tickFormatter={(v: number) => fmtCompact(v)} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...AXIS} axisLine={false} tick={CategoryTick} width={148} interval={0} />
              <Tooltip
                cursor={{ fill: "var(--accent-wash)" }}
                content={({ active, payload }) => {
                  const d = active && (payload?.[0]?.payload as CompareRow | undefined);
                  if (!d) return null;
                  return (
                    <TooltipBox
                      title={d.name}
                      rows={[
                        { label: `${unit} this week`, value: fmtInt(d.current), color: "var(--accent)" },
                        { label: `${unit} ${prevLabel.toLowerCase()}`, value: fmtInt(d.previous), color: "var(--accent-soft)" },
                        { label: "change", value: fmtPct(d.previous > 0 ? ((d.current - d.previous) / d.previous) * 100 : null) },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="current" name="This week" fill="var(--accent)" barSize={12} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="current" position="right" offset={6} fill="var(--ink-2)" fontSize={12} formatter={(v) => fmtCompact(Number(v))} />
              </Bar>
              <Bar dataKey="previous" name={prevLabel} fill="var(--accent-soft)" barSize={12} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted">No data for this week yet.</p>
      )}
    </ChartCard>
  );
}

/* ── Week-over-week growth % ──────────────────────────────────────── */

export type GrowthRow = { id: string; name: string; growth: number | null };

type BarShapeProps = { x?: number; y?: number; width?: number; height?: number; value?: number | [number, number] };

function GrowthBarShape(props: BarShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0 } = props;
  const raw = Array.isArray(props.value) ? props.value[1] : (props.value ?? 0);
  const left = Math.min(x, x + width);
  const w = Math.abs(width);
  const r = Math.min(4, w, height / 2);
  const fill = raw >= 0 ? "var(--good)" : "var(--bad)";
  // Rounded corners on the data end only; square against the zero baseline.
  const d =
    raw >= 0
      ? `M${left},${y} H${left + w - r} Q${left + w},${y} ${left + w},${y + r} V${y + height - r} Q${left + w},${y + height} ${left + w - r},${y + height} H${left} Z`
      : `M${left + w},${y} H${left + r} Q${left},${y} ${left},${y + r} V${y + height - r} Q${left},${y + height} ${left + r},${y + height} H${left + w} Z`;
  return <path d={d} fill={fill} />;
}

export function GrowthChart({ rows, partial }: { rows: GrowthRow[]; partial: boolean }) {
  const data = rows.filter((r) => r.growth !== null).map((r) => ({ ...r, growth: Number(r.growth!.toFixed(1)) }));
  data.sort((a, b) => b.growth - a.growth);
  const missing = rows.filter((r) => r.growth === null);
  const max = Math.max(10, ...data.map((d) => Math.abs(d.growth)));
  const height = Math.max(110, data.length * 34 + 36);
  return (
    <ChartCard
      title="Weekly growth comparison"
      subtitle={`Change in views vs ${partial ? "the same days of " : ""}last week. Green = growth, red = decline.`}
    >
      {data.length ? (
        <div style={{ height }} role="img" aria-label={`Growth by channel: ${data.map((d) => `${d.name} ${fmtPct(d.growth)}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 52, left: 0, bottom: 0 }} barCategoryGap={8}>
              <CartesianGrid horizontal={false} stroke="var(--grid)" />
              <XAxis type="number" domain={[-max * 1.15, max * 1.15]} {...AXIS} tick={TICK} tickFormatter={(v: number) => `${Math.round(v)}%`} />
              <YAxis type="category" dataKey="name" {...AXIS} axisLine={false} tick={CategoryTick} width={148} interval={0} />
              <ReferenceLine x={0} stroke="var(--axis)" />
              <Tooltip
                cursor={{ fill: "var(--accent-wash)" }}
                content={({ active, payload }) => {
                  const d = active && (payload?.[0]?.payload as GrowthRow | undefined);
                  if (!d) return null;
                  return <TooltipBox title={d.name} rows={[{ label: "views vs last week", value: fmtPct(d.growth, 1) }]} />;
                }}
              />
              <Bar dataKey="growth" barSize={14} shape={GrowthBarShape} isAnimationActive={false}>
                <LabelList
                  dataKey="growth"
                  content={(p) => {
                    const { x = 0, y = 0, width = 0, height = 0, value } = p as { x?: number; y?: number; width?: number; height?: number; value?: number };
                    const v = Number(value ?? 0);
                    const end = v >= 0 ? Math.max(Number(x), Number(x) + Number(width)) + 6 : Math.min(Number(x), Number(x) + Number(width)) - 6;
                    return (
                      <text x={end} y={Number(y) + Number(height) / 2} dy={4} textAnchor={v >= 0 ? "start" : "end"} fill="var(--ink-2)" fontSize={12}>
                        {fmtPct(v)}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted">Not enough data to compare yet.</p>
      )}
      {missing.length ? (
        <p className="mt-2 text-xs text-muted">
          Not compared (no views last week or data pending): {missing.map((m) => m.name).join(", ")}
        </p>
      ) : null}
    </ChartCard>
  );
}

/* ── Top 5 channels ───────────────────────────────────────────────── */

export function TopChannels({ rows }: { rows: { id: string; name: string; thumbnailUrl: string | null; views: number; growth: number | null }[] }) {
  const top = rows.filter((r) => r.views > 0).slice(0, 5);
  const max = Math.max(1, ...top.map((t) => t.views));
  const total = rows.reduce((s, r) => s + r.views, 0);
  return (
    <ChartCard title="Top 5 performing channels" subtitle="Ranked by views this week">
      {top.length ? (
        <ol className="flex flex-col gap-3">
          {top.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3">
              <span className="w-5 text-right text-sm font-semibold text-muted tabular">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink" title={r.name}>
                    {r.name}
                  </span>
                  <span className="shrink-0 text-sm tabular text-ink">
                    {fmtCompact(r.views)}
                    <span
                      className={cx(
                        "ml-2 text-xs",
                        r.growth === null ? "text-muted" : r.growth > 0 ? "text-good-text" : r.growth < 0 ? "text-bad-text" : "text-ink-2",
                      )}
                    >
                      {fmtPct(r.growth)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2" aria-hidden>
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${(r.views / max) * 100}%` }} />
                </div>
                <span className="text-xs text-muted">{total ? `${((r.views / total) * 100).toFixed(0)}% of all views` : null}</span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-10 text-center text-sm text-muted">No views recorded for this week yet.</p>
      )}
    </ChartCard>
  );
}
