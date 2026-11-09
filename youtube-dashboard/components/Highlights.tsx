import { AlertTriangle, Award, Eye, TrendingDown, TrendingUp, UserPlus } from "lucide-react";
import type { ChannelWeek, WeekSummary } from "@/lib/metrics";
import { fmtInt, fmtPct, videoUrl } from "@/lib/format";
import { Avatar } from "./ui";

function Card({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="card flex min-w-0 flex-col gap-2 p-4">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function ChannelLine({ c, metric }: { c: ChannelWeek | null | undefined; metric: React.ReactNode }) {
  if (!c) return <p className="text-sm text-muted">—</p>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar src={c.channel.thumbnailUrl} name={c.channel.title} size={32} />
      <div className="min-w-0">
        <p className="line-clamp-2 font-medium leading-snug text-ink" title={c.channel.title}>
          {c.channel.title}
        </p>
        <p className="text-sm">{metric}</p>
      </div>
    </div>
  );
}

export function Highlights({ s }: { s: WeekSummary }) {
  const h = s.highlights;
  return (
    <section aria-label="Highlights" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <Card icon={<TrendingUp size={14} aria-hidden />} label="Fastest-growing">
        <ChannelLine
          c={h.fastestGrowing}
          metric={h.fastestGrowing && <span className="font-medium text-good-text">{fmtPct(h.fastestGrowing.growthPct)} views</span>}
        />
        {!h.fastestGrowing && <p className="-mt-1 text-xs text-muted">No channel grew vs last week</p>}
      </Card>
      <Card icon={<TrendingDown size={14} aria-hidden />} label="Biggest decline">
        <ChannelLine
          c={h.biggestDecline}
          metric={h.biggestDecline && <span className="font-medium text-bad-text">{fmtPct(h.biggestDecline.growthPct)} views</span>}
        />
        {!h.biggestDecline && <p className="-mt-1 text-xs text-muted">No channel declined</p>}
      </Card>
      <Card icon={<Eye size={14} aria-hidden />} label="Highest-viewed">
        <ChannelLine c={h.highestViewed} metric={h.highestViewed && <span className="text-ink-2">{fmtInt(h.highestViewed.views)} views</span>} />
      </Card>
      <Card icon={<UserPlus size={14} aria-hidden />} label="Most new subscribers">
        <ChannelLine
          c={h.mostSubscribers}
          metric={h.mostSubscribers && <span className="text-ink-2">+{fmtInt(h.mostSubscribers.subscribersGained)} subscribers</span>}
        />
      </Card>
      <Card icon={<Award size={14} aria-hidden />} label="Best video">
        {h.bestVideo ? (
          <a href={videoUrl(h.bestVideo.videoId)} target="_blank" rel="noreferrer" className="group flex min-w-0 items-center gap-2">
            {h.bestVideo.thumbnailUrl ? (
              <img src={h.bestVideo.thumbnailUrl} alt="" className="h-9 w-16 shrink-0 rounded object-cover" referrerPolicy="no-referrer" />
            ) : null}
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium leading-snug text-ink group-hover:underline" title={h.bestVideo.title}>
                {h.bestVideo.title}
              </p>
              <p className="truncate text-sm text-ink-2">{fmtInt(h.bestVideo.views)} views · {h.bestVideo.channelTitle}</p>
            </div>
          </a>
        ) : (
          <p className="text-sm text-muted">No video data yet</p>
        )}
      </Card>
      <Card icon={<AlertTriangle size={14} aria-hidden />} label="Needs attention">
        {h.needsAttention ? (
          <>
            <ChannelLine c={h.needsAttention.channel} metric={null} />
            <p className="-mt-1 text-xs text-ink-2">{h.needsAttention.reason}</p>
          </>
        ) : (
          <p className="text-sm text-good-text">All channels stable or growing</p>
        )}
      </Card>
    </section>
  );
}
