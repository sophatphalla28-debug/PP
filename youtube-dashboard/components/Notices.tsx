import Link from "next/link";
import { Info, Unplug } from "lucide-react";
import type { WeekSummary } from "@/lib/metrics";

export function DataNotices({ s }: { s: WeekSummary }) {
  const disconnected = s.channels.filter((c) => c.channel.status === "needs_reauth");
  const erroring = s.channels.filter((c) => c.channel.status === "error");
  return (
    <div className="flex flex-col gap-2">
      {disconnected.length ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bad-wash px-4 py-2.5 text-sm text-ink">
          <Unplug size={16} aria-hidden className="text-bad-text" />
          <span>
            <strong>{disconnected.map((c) => c.channel.title).join(", ")}</strong> {disconnected.length === 1 ? "is" : "are"} disconnected —
            new data is not being collected.
          </span>
          <Link href="/channels" className="font-medium text-bad-text underline underline-offset-2">
            Reconnect
          </Link>
        </div>
      ) : null}
      {erroring.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-warn-wash px-4 py-2.5 text-sm text-ink">
          <Info size={16} aria-hidden className="text-warn-text" />
          <span>
            Last sync failed for <strong>{erroring.map((c) => c.channel.title).join(", ")}</strong>. It retries automatically;{" "}
            <Link href="/channels" className="underline underline-offset-2">
              see details
            </Link>
            .
          </span>
        </div>
      ) : null}
      {s.completeness.note ? (
        <div className="flex items-start gap-2 rounded-xl border border-line bg-accent-wash px-4 py-2.5 text-sm text-ink">
          <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          <span>{s.completeness.note}</span>
        </div>
      ) : null}
    </div>
  );
}
