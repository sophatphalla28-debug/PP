# YouTube Multi-Channel Dashboard

One private dashboard for **all** of your YouTube channels, plus a complete weekly report every
**Sunday at 08:00 Korea time**.

- Connect any number of channels, across different Google accounts and Brand Accounts (secure Google OAuth, read-only).
- At a glance: views, subscribers gained, watch hours, uploads and weekly growth, both overall and per channel.
- Charts: total views over time, views by channel, week-over-week growth, subscriber growth and the top 5 channels.
  Filter by channel and week.
- Top 10 videos across all channels each week, with thumbnail, views, watch time, average view duration, publish date and link.
- Winners and losers, a "needs attention" flag, and a three-point action plan.
- Dark/light mode; works on desktop, tablet and phone.
- **No invented numbers.** Days YouTube hasn't published yet are shown as *pending*, and growth compares the same days of each week.

---

## How it works

```
                 ┌──────────────── Vercel (Next.js 16) ────────────────┐
  You ──Google──▶│  Dashboard · Channels · Reports pages               │
     sign-in     │  /api/auth/*        OAuth (PKCE) sign-in + connect   │
                 │  /api/cron/sync     daily 07:00 KST (Vercel Cron)    │──▶ YouTube Data API v3
                 │  /api/reports/weekly  sync + build weekly report     │──▶ YouTube Analytics API
                 └───────────────┬──────────────────────────────────────┘
                                 │ encrypted refresh tokens, daily stats,
                                 ▼ weekly video stats, stored reports
                         Supabase Postgres

  Claude scheduled task ── Sunday 08:00 KST ──▶ POST /api/reports/weekly ──▶ report delivered to you
```

| Piece | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router) + TypeScript + Tailwind v4 | Same stack as the storefront in this repo; one deploy for UI + API + cron |
| Database | PostgreSQL on Supabase (any Postgres works) | Free tier is plenty; history is stored so weeks can be compared |
| Auth | Google OAuth 2.0 with PKCE | You never share passwords; each channel grants read-only access |
| Data | YouTube Analytics API (views, watch time, subscribers, top videos) + YouTube Data API (uploads, lifetime totals) | Official APIs only |
| Schedules | Vercel Cron (daily refresh) + Claude scheduled task (Sunday 08:00 KST report) | |
| Charts | Recharts | |

---

## Setup (about 20 minutes, one time)

You need three free accounts: **Google Cloud**, **Supabase** and **Vercel**. You never give anyone your
Google password. Each channel owner clicks "Allow" on Google's own consent screen.

### 1. Google Cloud: API access + OAuth client

1. Go to <https://console.cloud.google.com/> → **Select a project → New project** (e.g. "YouTube Dashboard").
2. **APIs & Services → Library**. Enable **YouTube Data API v3** and **YouTube Analytics API**.
3. **APIs & Services → OAuth consent screen** (called "Google Auth Platform" in newer consoles):
   - User type **External**. App name "YouTube Dashboard". Use your email for support and developer contact.
   - **Data access / Scopes**: add `.../auth/youtube.readonly`, `.../auth/yt-analytics.readonly`, `openid`, `email`, `profile`.
   - **Audience → Publishing status: click "Publish app" (In production).**
     ⚠️ This matters. While an app is in "Testing", Google expires its refresh tokens after **7 days**,
     and every channel would disconnect weekly. You don't need Google verification for personal use.
     The consent screen will show *"Google hasn't verified this app"*. Click **Advanced → Go to YouTube Dashboard**.
     It's your own app.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - **Authorized redirect URIs**: `https://YOUR-APP.vercel.app/api/auth/callback`
     (add `http://localhost:3000/api/auth/callback` too if you'll run it locally).
     You'll know `YOUR-APP` after step 3 below. Come back and add it then.
   - Copy the **Client ID** and **Client secret**.

### 2. Supabase: database

1. <https://supabase.com> → **New project**. Pick region **Northeast Asia (Seoul)** and set a database password.
2. **Connect** (top bar) → **Transaction pooler** → copy the URI (port **6543**) and put your password in it.
   That's your `DATABASE_URL`. Tables are created automatically on first use, or run `npm run db:migrate`.

### 3. Vercel: hosting + daily cron

1. Generate three random secrets on your computer:
   ```bash
   cd youtube-dashboard && npm install && npm run gen:keys
   ```
   (or ask Claude to generate them for you).
2. <https://vercel.com/new> → import this GitHub repo → **Root Directory: `youtube-dashboard`** → add the
   environment variables below → **Deploy**.

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase transaction-pooler URI (step 2) |
| `APP_URL` | `https://YOUR-APP.vercel.app` (no trailing slash) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from step 1.4 |
| `ALLOWED_EMAILS` | the Google email(s) allowed to open the dashboard, comma-separated |
| `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET` | from `npm run gen:keys` |

3. Add the final redirect URI to Google (step 1.4) if you haven't yet.
4. Open `https://YOUR-APP.vercel.app/api/health`. It should say `"ok": true`.

`vercel.json` registers the daily cron (`0 22 * * *` = 07:00 KST). On the free Hobby plan Vercel runs it
once a day at some point within that hour, so it always finishes before 08:00 KST.
Vercel sends `CRON_SECRET` automatically, so nobody else can trigger it.

### 4. Connect your channels

1. Open the dashboard → **Sign in with Google** (an email in `ALLOWED_EMAILS`).
2. **Connect a channel** → in Google's window pick the account **or Brand Account** that owns the channel → Allow.
   12 weeks of history load immediately.
3. Repeat for each channel. Channels on different Google accounts are fine: just pick a different account.

### 5. Weekly report every Sunday 08:00 KST

There are two independent paths, so the report is never missed:

- **In the dashboard**: the daily cron builds the report for the week that just ended every Sunday
  morning (KST). It's on the **Reports** page with a "Copy as Markdown" button.
- **Delivered to you by Claude**: a Claude scheduled task runs every Sunday at 08:00 Asia/Seoul. It
  calls `POST /api/reports/weekly?format=md` (which refreshes every channel first) and delivers the full
  report to you with a push notification. Setup and the exact task prompt are in
  [`docs/weekly-report-task.md`](docs/weekly-report-task.md). Claude can set this up for you once the app is deployed.

You can also fetch the report yourself:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://YOUR-APP.vercel.app/api/reports/weekly?format=md"
```

---

## How the numbers work

- **Week** = Sunday 00:00 → Saturday 23:59, **Korea time**. The report runs the following Sunday at 08:00 KST.
- **YouTube's daily data uses Pacific-time days**, the same as YouTube Studio. The API cannot split a day by
  hour, so each "day" in a Korea-time week is YouTube's day with that date. Upload counts use exact publish
  timestamps, so they follow Korea time precisely.
- **YouTube publishes analytics 2–3 days late.** At Sunday 08:00 KST, Friday and Saturday are usually not
  available yet. The dashboard and report then:
  - show which days are published ("6 of 7 days published");
  - compare growth on **the same days** of last week (e.g. Sun–Thu vs Sun–Thu), so a missing day never looks like a drop;
  - never fill missing days with zeros. The final numbers appear automatically once YouTube publishes them,
    and next week's report uses the complete figures.
- **Status**: Growing ≥ +5%, Declining ≤ −5%, otherwise Stable. "New" means no views last week; "Pending" means no data published yet.
- **Fastest-growing / biggest decline** only consider channels with at least 100 views last week, so a
  2→20 view jump doesn't win.
- **Total subscribers** come from YouTube's public counter, which YouTube rounds. Channels with hidden
  subscriber counts are excluded and flagged.

## Security

- Read-only scopes only (`youtube.readonly`, `yt-analytics.readonly`). The app cannot upload, edit or delete anything.
- OAuth uses PKCE + a signed, single-use state cookie. Refresh tokens are encrypted with **AES-256-GCM**,
  bound to their channel ID, and never sent to the browser.
- Dashboard access is limited to `ALLOWED_EMAILS` (checked on every request). Sessions are signed, httpOnly cookies.
- Scheduler endpoints require `CRON_SECRET` (constant-time comparison). Pages are `noindex` and can't be framed.
- **Remove channel** deletes all of its stored data and revokes the Google grant.
- If a grant expires or is revoked, the channel is marked **Reconnect needed** on the dashboard and in the
  report, and the other channels keep syncing.

## Quotas and scaling

- A daily sync costs about **4 YouTube Data API units per channel** (the free quota is 10,000/day), so hundreds
  of channels fit. Usage is shown on the Channels page.
- Rate limits and server errors are retried with exponential backoff. If the daily quota runs out, the sync
  stops cleanly and resumes after midnight Pacific time.
- Channels sync 3 at a time, least-recently-synced first, within a time budget. Anything left over is picked up on the next run.
- Every write is an upsert keyed on (channel, day) / (week, video) / week, so re-running never creates duplicates.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Finish setting up your dashboard" | An environment variable is missing; the page lists which. Add it in Vercel and redeploy. |
| `redirect_uri_mismatch` from Google | The redirect URI in Google Cloud must be exactly `APP_URL` + `/api/auth/callback`. |
| Channels disconnect every 7 days | The OAuth app is still in "Testing". Publish it (step 1.3), then reconnect each channel once. |
| "That Google account isn't on this dashboard's allowlist" | Add the email to `ALLOWED_EMAILS` and redeploy. |
| "Both read-only permissions are needed" | Google lets you untick permissions. Connect again and leave both boxes ticked. |
| A day shows as pending for a long time | YouTube occasionally publishes late. It fills in on the next sync. |
| Vercel build error about `maxDuration` | Turn on **Fluid compute** (Project → Settings → Functions), the default for new projects. |

## Development

```bash
cd youtube-dashboard
npm install
cp .env.example .env.local   # fill in values; DATABASE_URL can be a local Postgres
npm run dev                  # http://localhost:3000

npm run lint && npm run typecheck
npm test                                                        # unit tests
TEST_DATABASE_URL=postgres://… npm test                         # + database integration tests
npm run build && E2E_DATABASE_URL=postgres://… npm run test:e2e # full browser test against a fake Google
npm run schedule:check                                          # next Sunday 08:00 KST run times
```

The automated tests use a **fake Google server** (`scripts/e2e/fake-google.mjs`) with synthetic channels
named "Test Channel …". It only runs when `TEST_ONLY_GOOGLE_MOCK_URL` is set, and that setting is ignored on Vercel.
The production dashboard only ever shows data from the official YouTube APIs.

```
app/                 pages (dashboard, channels, reports, login) + API routes
components/          UI: KPI tiles, highlights, table, charts, top videos
lib/google/          OAuth, Data API, Analytics API clients (retry + quota handling)
lib/sync.ts          per-channel sync (backfill, daily refresh, uploads, top videos)
lib/metrics.ts       weekly maths: like-for-like comparison, highlights, completeness
lib/report.ts        weekly report text, action plan, executive summary
lib/schema.ts        database schema (applied automatically)
tests/               unit + database integration tests
scripts/e2e/         fake Google + Playwright end-to-end test
docs/                weekly report scheduled task
```
