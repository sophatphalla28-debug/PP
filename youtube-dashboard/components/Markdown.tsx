import { Fragment } from "react";

/**
 * Minimal renderer for the report markdown we generate (headings, lists, quotes, bold, italics, links).
 * Builds React elements only — no innerHTML — so channel and video titles can never inject markup.
 */
function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("_")) out.push(<em key={k} className="text-muted">{tok.slice(1, -1)}</em>);
    else
      out.push(
        <a key={k} href={tok} target="_blank" rel="noreferrer" className="break-all text-accent underline underline-offset-2">
          {tok}
        </a>,
      );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = (k: number) => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${k}`} className={list.ordered ? "ml-5 list-decimal space-y-1.5" : "ml-5 list-disc space-y-1"}>
        {list.items.map((it, j) => (
          <li key={j}>{inline(it, `l${k}-${j}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  lines.forEach((raw, k) => {
    const line = raw.trimEnd();
    const ul = /^- (.*)$/.exec(line);
    const ol = /^\d+\. (.*)$/.exec(line);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (list && list.ordered !== ordered) flush(k);
      list ??= { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
      return;
    }
    flush(k);
    if (!line) return;
    if (line.startsWith("### ")) blocks.push(<h4 key={k} className="mt-4 font-semibold text-ink">{inline(line.slice(4), `h${k}`)}</h4>);
    else if (line.startsWith("## ")) blocks.push(<h3 key={k} className="mt-6 border-b border-line pb-1 text-sm font-bold uppercase tracking-wide text-ink">{inline(line.slice(3), `h${k}`)}</h3>);
    else if (line.startsWith("# ")) blocks.push(<h2 key={k} className="text-xl font-bold text-ink">{inline(line.slice(2), `h${k}`)}</h2>);
    else if (line.startsWith("> ")) blocks.push(<blockquote key={k} className="rounded-lg bg-accent-wash px-3 py-2 text-sm">{inline(line.slice(2), `q${k}`)}</blockquote>);
    else if (line === "---") blocks.push(<hr key={k} className="my-4 border-line" />);
    else blocks.push(<p key={k}>{inline(line, `p${k}`)}</p>);
  });
  flush(lines.length);
  return <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
