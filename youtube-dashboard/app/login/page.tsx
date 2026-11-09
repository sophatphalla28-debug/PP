import { redirect } from "next/navigation";
import { BarChart3, ShieldCheck } from "lucide-react";
import { getConfigStatus } from "@/lib/env";
import { getOwner } from "@/lib/auth";
import { SetupRequired } from "@/components/SetupRequired";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_allowed: "That Google account isn't on this dashboard's allowlist (ALLOWED_EMAILS).",
  denied: "Sign-in was cancelled.",
  expired: "The sign-in link expired. Please try again.",
  google: "Google returned an error. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; signedOut?: string }> }) {
  const config = getConfigStatus();
  if (!config.ok) return <SetupRequired problems={config.problems} />;
  if (await getOwner()) redirect("/");
  const { error, signedOut } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-sm p-7">
        <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white" aria-hidden>
          <BarChart3 size={20} />
        </span>
        <h1 className="text-xl font-semibold">YouTube Dashboard</h1>
        <p className="mt-1 text-sm text-ink-2">All your channels, one weekly view.</p>
        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-bad-wash px-3 py-2 text-sm text-ink">
            {ERRORS[error] ?? ERRORS.google}
          </p>
        ) : null}
        {signedOut ? <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">You&apos;re signed out.</p> : null}
        <a href="/api/auth/login" className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-medium text-page hover:opacity-90">
          <svg aria-hidden width="16" height="16" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Sign in with Google
        </a>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck size={14} aria-hidden className="mt-0.5 shrink-0" />
          Sign-in only shares your email address. Channels are connected separately with read-only YouTube access.
        </p>
      </div>
    </main>
  );
}
