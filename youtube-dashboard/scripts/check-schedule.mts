// Prints the next weekly report times and the reporting window each one covers.
import { formatWeek, lastCompletedWeekStart, nextReportTime } from "../lib/time.ts";

let at = new Date();
for (let i = 0; i < 4; i++) {
  at = nextReportTime(at);
  const kst = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", dateStyle: "full", timeStyle: "short" }).format(at);
  console.log(`${kst} KST  (= ${at.toISOString()})  → reports on ${formatWeek(lastCompletedWeekStart(at))}`);
  at = new Date(at.getTime() + 60_000);
}
