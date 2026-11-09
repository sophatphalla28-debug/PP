import { ArrowDownRight, ArrowUpRight, Clock, Minus, Sparkles, Unplug, AlertTriangle } from "lucide-react";
import type { TrendStatus } from "@/lib/metrics";
import type { ChannelStatus } from "@/lib/repo";
import { fmtPct } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Signed growth with an arrow, so direction never relies on colour alone. */
export function Delta({ pct, suffix, className }: { pct: number | null; suffix?: string; className?: string }) {
  if (pct === null) return <span className={cx("text-muted", className)}>n/a</span>;
  const r = Number(pct.toFixed(0));
  const tone = r > 0 ? "text-good-text" : r < 0 ? "text-bad-text" : "text-ink-2";
  const Icon = r > 0 ? ArrowUpRight : r < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cx("inline-flex items-center gap-0.5 font-medium tabular", tone, className)}>
      <Icon aria-hidden size={14} strokeWidth={2.5} />
      {fmtPct(pct)}
      {suffix ? <span className="ml-1 font-normal text-muted">{suffix}</span> : null}
    </span>
  );
}

const STATUS: Record<TrendStatus, { label: string; cls: string; Icon: typeof Minus }> = {
  growing: { label: "Growing", cls: "bg-good-wash text-good-text", Icon: ArrowUpRight },
  declining: { label: "Declining", cls: "bg-bad-wash text-bad-text", Icon: ArrowDownRight },
  stable: { label: "Stable", cls: "bg-surface-2 text-ink-2", Icon: Minus },
  new: { label: "New", cls: "bg-accent-wash text-accent", Icon: Sparkles },
  "no-data": { label: "Pending", cls: "bg-surface-2 text-muted", Icon: Clock },
};

export function StatusBadge({ status }: { status: TrendStatus }) {
  const s = STATUS[status];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>
      <s.Icon aria-hidden size={12} strokeWidth={2.5} />
      {s.label}
    </span>
  );
}

export function ConnectionBadge({ status }: { status: ChannelStatus }) {
  if (status === "active") return null;
  const needs = status === "needs_reauth";
  const Icon = needs ? Unplug : AlertTriangle;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        needs ? "bg-bad-wash text-bad-text" : "bg-warn-wash text-warn-text",
      )}
    >
      <Icon aria-hidden size={12} strokeWidth={2.5} />
      {needs ? "Reconnect needed" : "Sync error"}
    </span>
  );
}

export function Avatar({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  if (!src) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2"
        style={{ width: size, height: size }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full" style={{ width: size, height: size }} />;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
