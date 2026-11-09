"use client";

import { Calendar, Check, ChevronDown, Search, Tv } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Avatar, cx } from "./ui";

type Opt = { value: string; label: string };
type Ch = { id: string; title: string; thumbnailUrl: string | null };

export function FilterBar({
  weeks,
  week,
  channels,
  selected,
  range,
}: {
  weeks: Opt[];
  week: string;
  channels: Ch[];
  selected: string[];
  range: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function go(next: { week?: string; channels?: string[]; range?: number }) {
    const p = new URLSearchParams();
    p.set("week", next.week ?? week);
    const ids = next.channels ?? selected;
    if (ids.length && ids.length < channels.length) p.set("channels", ids.join(","));
    const r = next.range ?? range;
    if (r !== 12) p.set("range", String(r));
    start(() => router.push(`/?${p}`, { scroll: false }));
  }

  return (
    <div className={cx("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <label className="relative inline-flex items-center">
        <span className="sr-only">Week</span>
        <Calendar size={15} aria-hidden className="pointer-events-none absolute left-3 text-muted" />
        <select
          value={week}
          onChange={(e) => go({ week: e.target.value })}
          className="h-9 appearance-none rounded-lg border border-line bg-surface pl-9 pr-8 text-sm font-medium text-ink"
        >
          {weeks.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2.5 text-muted" />
      </label>
      <ChannelPicker channels={channels} selected={selected} onApply={(ids) => go({ channels: ids })} />
      <label className="relative inline-flex items-center">
        <span className="sr-only">History shown in trend chart</span>
        <select
          value={range}
          onChange={(e) => go({ range: Number(e.target.value) })}
          className="h-9 appearance-none rounded-lg border border-line bg-surface pl-3 pr-8 text-sm text-ink"
        >
          <option value={8}>Trend: 8 weeks</option>
          <option value={12}>Trend: 12 weeks</option>
          <option value={26}>Trend: 26 weeks</option>
        </select>
        <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2.5 text-muted" />
      </label>
    </div>
  );
}

function ChannelPicker({ channels, selected, onApply }: { channels: Ch[]; selected: string[]; onApply: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set(selected.length ? selected : channels.map((c) => c.id)));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = useMemo(
    () => channels.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase())),
    [channels, query],
  );
  const count = selected.length && selected.length < channels.length ? selected.length : channels.length;
  const label = count === channels.length ? `All channels (${channels.length})` : `${count} of ${channels.length} channels`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(new Set(selected.length ? selected : channels.map((c) => c.id)));
          setOpen((o) => !o);
        }}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink"
      >
        <Tv size={15} aria-hidden className="text-muted" />
        {label}
        <ChevronDown size={14} aria-hidden className="text-muted" />
      </button>
      {open ? (
        <div role="dialog" aria-label="Filter channels" className="card absolute left-0 z-40 mt-2 w-72 p-2 shadow-lg">
          <label className="relative mb-2 flex items-center">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channels"
              className="h-9 w-full rounded-lg border border-line bg-page pl-8 pr-2 text-sm text-ink placeholder:text-muted"
            />
          </label>
          <ul className="max-h-64 overflow-y-auto">
            {visible.map((c) => {
              const on = draft.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => {
                      const n = new Set(draft);
                      if (on) n.delete(c.id);
                      else n.add(c.id);
                      setDraft(n);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-2"
                  >
                    <span className={cx("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-accent bg-accent text-white" : "border-line")}>
                      {on ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
                    </span>
                    <Avatar src={c.thumbnailUrl} name={c.title} size={20} />
                    <span className="truncate">{c.title}</span>
                  </button>
                </li>
              );
            })}
            {!visible.length ? <li className="px-2 py-3 text-sm text-muted">No channels match “{query}”.</li> : null}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <div className="flex gap-1 text-xs">
              <button type="button" className="rounded px-2 py-1 text-ink-2 hover:bg-surface-2" onClick={() => setDraft(new Set(channels.map((c) => c.id)))}>
                All
              </button>
              <button type="button" className="rounded px-2 py-1 text-ink-2 hover:bg-surface-2" onClick={() => setDraft(new Set())}>
                None
              </button>
            </div>
            <button
              type="button"
              disabled={!draft.size}
              onClick={() => {
                setOpen(false);
                onApply(draft.size === channels.length ? [] : [...draft]);
              }}
              className="h-8 rounded-lg bg-accent px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
