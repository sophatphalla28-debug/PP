"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeChannelAction } from "@/app/actions";

export function RemoveChannelButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Remove “${title}”?\n\nThis deletes its stored statistics from the dashboard and revokes the dashboard's Google access. You can reconnect it later.`)) return;
          start(async () => {
            const r = await removeChannelAction(id);
            // The row disappears after removal, so show the outcome as a page-level message.
            router.replace(`/channels?removed=${encodeURIComponent(title)}&revoked=${r.revoked ? "1" : "0"}`);
          });
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-bad-text hover:bg-bad-wash disabled:opacity-60"
      >
        <Trash2 size={13} aria-hidden />
        {pending ? "Removing…" : "Remove"}
    </button>
  );
}
