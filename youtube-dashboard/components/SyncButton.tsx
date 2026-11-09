"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { syncNowAction } from "@/app/actions";
import { cx } from "./ui";

export function SyncButton({ channelId, label = "Sync now", compact }: { channelId?: string; label?: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await syncNowAction(channelId);
            setMsg({ ok: r.ok, text: r.message });
          })
        }
        className={cx(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-60",
          compact && "h-8 px-2.5 text-xs",
        )}
        title="Fetch the latest numbers from YouTube"
      >
        <RefreshCw size={14} aria-hidden className={pending ? "animate-spin" : undefined} />
        <span className={compact ? undefined : "hidden sm:inline"}>{pending ? "Syncing…" : label}</span>
      </button>
      {msg ? (
        <span role="status" className={cx("max-w-xs truncate text-xs", msg.ok ? "text-good-text" : "text-bad-text")} title={msg.text}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}
