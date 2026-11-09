"use client";

import { Check, Copy, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateReportAction } from "@/app/actions";

export function GenerateReportButton({ week, label }: { week?: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await generateReportAction(week);
          if (r.weekStart) router.push(`/reports?week=${r.weekStart}`);
        })
      }
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white disabled:opacity-60"
    >
      <FileText size={14} aria-hidden />
      {pending ? "Generating…" : label}
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {done ? "Copied" : "Copy as Markdown"}
    </button>
  );
}
