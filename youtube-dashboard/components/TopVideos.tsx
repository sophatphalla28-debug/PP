import { ExternalLink } from "lucide-react";
import type { TopVideo } from "@/lib/repo";
import { fmtDate, fmtDuration, fmtHours, fmtInt, videoUrl } from "@/lib/format";
import { SectionTitle } from "./ui";

export function TopVideos({ videos, partial }: { videos: TopVideo[]; partial: boolean }) {
  return (
    <section className="card p-4" aria-label="Top performing videos">
      <SectionTitle
        title="Top 10 videos this week"
        subtitle={`Across all selected channels, by views earned during the week${partial ? " (published days so far)" : ""}`}
      />
      {videos.length ? (
        <ol className="divide-y divide-line">
          {videos.map((v, i) => (
            <li key={v.videoId} className="flex gap-3 py-3">
              <span className="w-5 pt-1 text-right text-sm font-semibold text-muted tabular">{i + 1}</span>
              <a href={videoUrl(v.videoId)} target="_blank" rel="noreferrer" className="shrink-0">
                {v.thumbnailUrl ? (
                  <img
                    src={v.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-video w-28 rounded-md object-cover sm:w-36"
                  />
                ) : (
                  <span className="block aspect-video w-28 rounded-md bg-surface-2 sm:w-36" />
                )}
              </a>
              <div className="min-w-0 flex-1">
                <a href={videoUrl(v.videoId)} target="_blank" rel="noreferrer" className="group inline-flex max-w-full items-start gap-1">
                  <span className="line-clamp-2 font-medium text-ink group-hover:underline">{v.title}</span>
                  <ExternalLink size={13} aria-hidden className="mt-1 shrink-0 text-muted" />
                </a>
                <p className="truncate text-sm text-ink-2">{v.channelTitle}</p>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4 tabular">
                  <div>
                    <dt className="text-muted">Views</dt>
                    <dd className="font-semibold text-ink">{fmtInt(v.views)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Watch time</dt>
                    <dd className="text-ink">{fmtHours(v.watchMinutes / 60)} h</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Avg view duration</dt>
                    <dd className="text-ink">{fmtDuration(v.averageViewDurationSeconds)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Published</dt>
                    <dd className="text-ink">{fmtDate(v.publishedAt)}</dd>
                  </div>
                </dl>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-6 text-sm text-muted">No video data for this week yet. YouTube publishes per-video totals with a 2–3 day delay.</p>
      )}
    </section>
  );
}
