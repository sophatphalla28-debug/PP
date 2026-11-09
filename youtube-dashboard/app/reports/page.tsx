import Link from "next/link";
import { db } from "@/lib/db";
import { getConfigStatus } from "@/lib/env";
import { requireOwner } from "@/lib/auth";
import * as repo from "@/lib/repo";
import { formatKstDateTime, formatWeek, isDateStr, lastCompletedWeekStart, nextReportTime, weekStartOf } from "@/lib/time";
import { AppShell } from "@/components/AppShell";
import { SetupRequired } from "@/components/SetupRequired";
import { Markdown } from "@/components/Markdown";
import { CopyButton, GenerateReportButton } from "@/components/ReportActions";
import { cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = { title: "Weekly reports" };

const TRIGGER: Record<string, string> = { cron: "automatic", scheduled: "Sunday 08:00 KST task", manual: "generated manually" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const config = getConfigStatus();
  if (!config.ok) return <SetupRequired problems={config.problems} />;
  const owner = await requireOwner();
  const sql = await db();
  const list = await repo.listReports(sql);
  const { week } = await searchParams;
  const selectedWeek = isDateStr(week) ? weekStartOf(week) : list[0]?.weekStart;
  const report = selectedWeek ? await repo.getReport(sql, selectedWeek) : null;
  const lastWeek = lastCompletedWeekStart(new Date());

  return (
    <AppShell active="/reports" email={owner.email}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly reports</h1>
          <p className="text-sm text-muted">Generated every Sunday at 08:00 Korea time · next: {formatKstDateTime(nextReportTime(new Date()))}</p>
        </div>
        <GenerateReportButton week={lastWeek} label={list.some((r) => r.weekStart === lastWeek) ? "Refresh last week's report" : "Generate last week's report"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Report weeks" className="card h-fit p-2">
          {list.length ? (
            <ul>
              {list.map((r) => (
                <li key={r.weekStart}>
                  <Link
                    href={`/reports?week=${r.weekStart}`}
                    aria-current={r.weekStart === selectedWeek ? "page" : undefined}
                    className={cx("block rounded-lg px-3 py-2 text-sm", r.weekStart === selectedWeek ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2")}
                  >
                    {formatWeek(r.weekStart)}
                    <span className="block text-xs text-muted">{TRIGGER[r.trigger] ?? r.trigger}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted">No reports yet. The first one arrives Sunday at 08:00 KST, or generate it now.</p>
          )}
        </nav>
        <article className="card min-w-0 p-5">
          {report ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  Generated {formatKstDateTime(report.generatedAt)} · {TRIGGER[report.trigger] ?? report.trigger}
                </p>
                <CopyButton text={report.markdown} />
              </div>
              <Markdown source={report.markdown} />
            </>
          ) : (
            <p className="text-sm text-muted">{selectedWeek ? `No report stored for ${formatWeek(selectedWeek)}.` : "Select a week."}</p>
          )}
        </article>
      </div>
    </AppShell>
  );
}
