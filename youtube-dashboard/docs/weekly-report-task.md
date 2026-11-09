# Weekly report: Claude scheduled task

Every **Sunday at 08:00 Asia/Seoul**, a Claude scheduled task starts a fresh cloud session, asks the deployed
dashboard to refresh all channels and build the report for the week that just ended (Sun–Sat KST), and
delivers it to you with a push notification. The full report is that session's final message.

## Settings

| Setting | Value |
|---|---|
| Schedule | `CRON_TZ=Asia/Seoul 0 8 * * 0` (Sunday 08:00 KST = Saturday 23:00 UTC; Korea has no daylight saving) |
| Runs in | a fresh session each time, in a personal cloud environment that can reach your dashboard's host |
| Credential | your `CRON_SECRET`, saved as a network secret for the dashboard host (`Authorization: Bearer …`), so the task never sees the value |
| Notification | push |

## Task prompt

```
Deliver my weekly YouTube report.

1. Run exactly:
   curl -sS --max-time 290 -X POST -H "Authorization: Bearer placeholder" \
     "https://YOUR-APP.vercel.app/api/reports/weekly?format=md" -w "\nHTTP %{http_code}\n"
   (The network proxy replaces the placeholder with the saved secret.)
2. If it returns HTTP 200, reply with the returned Markdown report exactly as received. Do not change,
   round, add or remove any numbers, channels or videos. Before the report, add one line naming the
   channel that needs attention, if the report names one.
3. If the request fails (non-200, timeout, network error), retry once after 60 seconds. If it still fails,
   reply "Weekly YouTube report FAILED" with the HTTP status and response body, and say that the report
   can also be generated from the dashboard's Reports page. Never invent or estimate statistics.
```

## Verifying the schedule

- `npm run schedule:check` prints the next four run times in KST and UTC and the week each one covers.
- The scheduled task's `next_run_at` should be a Saturday at `23:00:00Z`.
- A manual "run now" of the task returns the same report that the Reports page shows for last week.
