// End-to-end test: production build + real PostgreSQL + fake Google server, driven by Chromium.
// Usage: E2E_DATABASE_URL=postgres://… node scripts/e2e/run-e2e.mjs   (run `npm run build` first)
// Verifies sign-in allowlist, multi-account channel connection, scope checks, sync, dashboard numbers,
// filters, dark mode, mobile layout, the weekly report endpoint + auth, revocation and removal.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { createFakeGoogle } from "./fake-google.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const DB = process.env.E2E_DATABASE_URL;
if (!DB) throw new Error("Set E2E_DATABASE_URL");
const OUT = process.env.E2E_OUT ?? path.resolve("test-results/e2e");
mkdirSync(OUT, { recursive: true });
const MOCK_PORT = 4010;
const APP_PORT = 3100;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const CRON_SECRET = "e2e-cron-secret-0123456789abcdef";
const anchorDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── fake Google ──────────────────────────────────────────────────────
const fake = createFakeGoogle({ base: MOCK, anchorDate });
const mock = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const r = fake.handle(req.method, req.url, body, req.headers);
    res.writeHead(r.status, r.headers);
    res.end(r.body);
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));

// ── fresh database ───────────────────────────────────────────────────
const sql = postgres(DB, { onnotice: () => {} });
await sql.unsafe("drop schema public cascade; create schema public;");

// ── app (production build) ───────────────────────────────────────────
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: DB,
    APP_URL: APP,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    ALLOWED_EMAILS: "owner@example.com",
    SESSION_SECRET: "e2e-session-secret-that-is-long-enough-123",
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    CRON_SECRET,
    TEST_ONLY_GOOGLE_MOCK_URL: MOCK,
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // own process group, so the whole server tree can be stopped
});
const stopApp = () => {
  try {
    process.kill(-app.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stopApp);
let appLog = "";
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));

async function waitFor(url, ms = 30_000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return r;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}\n${appLog}`);
}

let browser;
try {
  const health = await waitFor(`${APP}/api/health`);
  check("health endpoint reports configured + database reachable", health.status === 200, JSON.stringify(await health.json()));

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const pick = async (account) => {
    await page.waitForURL(/127\.0\.0\.1:4010\/auth/);
    await page.click(`a[data-account="${account}"]`);
  };

  // 1. Unauthenticated → login
  await page.goto(APP);
  check("dashboard redirects to sign-in when signed out", page.url().endsWith("/login"));
  await page.screenshot({ path: `${OUT}/01-login.png` });

  // 2. Allowlist enforced
  await page.click("text=Sign in with Google");
  await pick("intruder");
  await page.waitForURL(/\/login\?error=not_allowed/);
  check("non-allowlisted Google account is refused", (await page.textContent("[role=alert]")).includes("allowlist"));

  // 3. Owner signs in
  await page.click("text=Sign in with Google");
  await pick("owner");
  await page.waitForURL(`${APP}/`);
  check("owner signs in and sees onboarding", await page.isVisible("text=Connect your first YouTube channel"));
  const cookies = await ctx.cookies();
  const session = cookies.find((c) => c.name === "ytd_session");
  check("session cookie is httpOnly + SameSite=Lax", !!session && session.httpOnly && session.sameSite === "Lax");

  // 4. Channel connection edge cases
  await page.goto(`${APP}/api/auth/connect`);
  await pick("alpha-noanalytics");
  await page.waitForURL(/\/channels\?error=scopes/);
  check("partial scope grant is rejected and revoked", (await page.textContent("[role=alert]")).includes("Both read-only permissions"));

  await page.goto(`${APP}/api/auth/connect`);
  await pick("nochannel");
  await page.waitForURL(/\/channels\?error=no_channel/);
  check("account without a channel is rejected", true);

  await page.goto(`${APP}/api/auth/connect`);
  await pick("cancel");
  await page.waitForURL(/\/channels\?error=denied/);
  check("cancelled consent is handled", true);

  // 5. Connect three channels across two Google accounts (one Brand Account)
  for (const acct of ["alpha", "beta", "gamma"]) {
    await page.goto(`${APP}/api/auth/connect`);
    await pick(acct);
    await page.waitForURL(/\/channels\?connected=/, { timeout: 60_000 });
  }
  const channelRows = await page.locator("main ul.card > li").count();
  check("three channels connected (two Google accounts + Brand Account)", channelRows === 3, `${channelRows} rows`);
  await page.screenshot({ path: `${OUT}/02-channels.png`, fullPage: true });

  const stored = await sql`select id, refresh_token_enc from channels`;
  check("refresh tokens are encrypted at rest", stored.every((r) => r.refresh_token_enc.startsWith("v1.") && !r.refresh_token_enc.includes("rt-")));

  // 6. Dashboard numbers equal the source data
  await page.goto(APP);
  await page.waitForSelector("text=Channel performance");
  const heading = await page.textContent("main h1");
  const weekStart = new URL(page.url()).searchParams.get("week") ?? null;
  // Expected: last completed KST week, days published so far (fake has a 2-day delay)
  const kstToday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const dow = new Date(`${kstToday}T00:00:00Z`).getUTCDay();
  const DAY = 86_400_000;
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const lastWeek = ymd(Date.parse(`${kstToday}T00:00:00Z`) - (dow + 7) * DAY);
  const through = fake.dataThrough();
  let expected = 0;
  let days = 0;
  for (let i = 0; i < 7; i++) {
    const d = ymd(Date.parse(`${lastWeek}T00:00:00Z`) + i * DAY);
    if (d <= through) {
      expected += fake.dailyRow("alpha", d).views;
      days++;
    }
  }
  const alphaRow = page.locator("table tbody tr", { hasText: "Test Channel Alpha" });
  const alphaViews = (await alphaRow.locator("td").nth(1).textContent()) ?? "";
  check(
    "Alpha's weekly views match YouTube data exactly",
    alphaViews.replace(/[^\d]/g, "").startsWith(String(expected)),
    `table "${alphaViews.trim()}" vs expected ${expected.toLocaleString("en-US")} (${days}/7 days) · ${heading} ${weekStart ?? ""}`,
  );
  if (days < 7) check("partial week is flagged, not padded", await page.isVisible("text=Growth compares the same days of last week"));
  check("growing channel shows green 'Growing' badge", await alphaRow.locator("text=Growing").isVisible());
  check("declining channel shows 'Declining' badge", await page.locator("table tbody tr", { hasText: "Test Channel Beta" }).locator("text=Declining").isVisible());
  const subsTile = await page.locator("section[aria-label='Overall performance'] > div", { hasText: "Total subscribers" }).textContent();
  check("total subscribers sums every channel (48.2K + 152K + 3.9K)", subsTile.includes("204.1K"), subsTile);
  check("top 10 videos rendered", (await page.locator("section[aria-label='Top performing videos'] li").count()) === 10);
  check("charts rendered", (await page.locator(".recharts-surface").count()) >= 4);
  await page.screenshot({ path: `${OUT}/03-dashboard-light.png`, fullPage: true });

  // 7. Filters
  await page.click("button:has-text('All channels (3)')");
  await page.click("[role=dialog] button:has-text('None')");
  await page.click("[role=dialog] button[role=checkbox]:has-text('Test Channel Gamma')");
  await page.click("[role=dialog] button:has-text('Apply')");
  await page.waitForURL(/channels=/);
  await page.waitForSelector("text=1 of 3 channels");
  check("channel filter scopes the whole dashboard", (await page.locator("table tbody tr").count()) === 1);
  await page.goto(APP);
  await page.fill("input[placeholder='Search channels']", "beta");
  check("table search filters rows", (await page.locator("table tbody tr").count()) === 1);

  // 8. Dark mode
  await page.goto(APP);
  await page.click("button[aria-label='Switch to dark mode']");
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.reload();
  const persisted = await page.evaluate(() => document.documentElement.dataset.theme);
  check("dark mode toggles and persists", theme === "dark" && persisted === "dark");
  await page.waitForSelector(".recharts-surface");
  await page.screenshot({ path: `${OUT}/04-dashboard-dark.png`, fullPage: true });

  // 9. Weekly report endpoint (what the Sunday 08:00 KST task calls)
  const unauth = await fetch(`${APP}/api/reports/weekly?format=md`, { method: "POST" });
  check("report endpoint rejects requests without the secret", unauth.status === 401);
  const wrong = await fetch(`${APP}/api/reports/weekly?format=md`, { method: "POST", headers: { authorization: "Bearer nope" } });
  check("report endpoint rejects a wrong secret", wrong.status === 401);
  const rep = await fetch(`${APP}/api/reports/weekly?format=md`, { method: "POST", headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const md = await rep.text();
  const sections = ["MY YOUTUBE WEEKLY REPORT", "OVERALL PERFORMANCE", "TOP 5 CHANNELS", "CHANNEL PERFORMANCE", "WINNERS AND LOSERS", "MY ACTION PLAN", "EXECUTIVE SUMMARY"];
  check("scheduled report endpoint returns the full report", rep.status === 200 && sections.every((s) => md.includes(s)), `${md.length} chars`);
  check("report quotes the same Alpha number as the dashboard", md.includes(`This week's views: ${expected.toLocaleString("en-US")}`));
  const cron = await fetch(`${APP}/api/cron/sync`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  check("daily cron endpoint runs", cron.status === 200, JSON.stringify(await cron.json()));
  const [{ n: reportCount }] = await sql`select count(*)::int n from weekly_reports`;
  check("report stored once per week (no duplicates)", reportCount === 1);

  // 10. Revoked access → reconnect prompt
  await fetch(`${MOCK}/test/revoke?account=beta`);
  await page.goto(`${APP}/channels`);
  await page.click("header button:has-text('Sync all')");
  await page.waitForSelector("text=Reconnect needed", { timeout: 60_000 });
  check("revoked Google access shows 'Reconnect needed'", true);
  const rep2 = await (await fetch(`${APP}/api/reports/weekly?format=md&sync=0`, { method: "POST", headers: { authorization: `Bearer ${CRON_SECRET}` } })).text();
  check("report tells you to reconnect the channel", rep2.includes("Reconnect Test Channel Beta"));
  await page.goto(APP);
  check("dashboard warns about the disconnected channel", await page.isVisible("[role=alert]:has-text('disconnected')"));
  await fetch(`${MOCK}/test/restore`);
  await page.goto(`${APP}/api/auth/connect`);
  await pick("beta");
  await page.waitForURL(/connected=/, { timeout: 60_000 });
  check("reconnecting restores the channel", !(await page.isVisible("text=Reconnect needed")));

  // 11. Reports page
  await page.goto(`${APP}/reports`);
  check("reports page renders the stored report", await page.isVisible("text=MY YOUTUBE WEEKLY REPORT"));
  await page.screenshot({ path: `${OUT}/05-report.png`, fullPage: true });

  // 12. Mobile
  const mobile = await browser.newContext({ ...require("playwright").devices["iPhone 13"], storageState: await ctx.storageState() });
  const m = await mobile.newPage();
  await m.goto(APP);
  await m.waitForSelector("text=Channel performance");
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("mobile layout has no horizontal scroll", overflow <= 0, `overflow ${overflow}px`);
  await m.screenshot({ path: `${OUT}/06-mobile.png`, fullPage: true });
  await mobile.close();

  // 13. Remove a channel
  await page.goto(`${APP}/channels`);
  await page.locator("li", { hasText: "Test Channel Gamma" }).locator("button:has-text('Remove')").click();
  await page.waitForURL(/removed=/);
  await page.waitForSelector("text=Channel removed");
  const state = await (await fetch(`${MOCK}/test/state`)).json();
  const [{ n: gammaRows }] = await sql`select count(*)::int n from channel_daily_stats where channel_id = 'UCtestGammaChannel000003'`;
  check("removing a channel revokes Google access and deletes its data", state.revokedCalls.some((t) => t.startsWith("rt-gamma-")) && gammaRows === 0);

  // 14. Sign out
  await page.click("button[aria-label='Sign out']");
  await page.waitForURL(/\/login\?signedOut=1/);
  check("sign out clears the session", true);

  check("no uncaught browser errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (e) {
  check("e2e run completed", false, `${e.message}\n--- app log ---\n${appLog.slice(-3000)}`);
} finally {
  await browser?.close();
  stopApp();
  mock.close();
  await sql.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
