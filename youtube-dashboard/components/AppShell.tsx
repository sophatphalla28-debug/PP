import Link from "next/link";
import { BarChart3, FileText, LogOut, Tv } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", Icon: BarChart3 },
  { href: "/channels", label: "Channels", Icon: Tv },
  { href: "/reports", label: "Reports", Icon: FileText },
] as const;

export function AppShell({
  active,
  email,
  actions,
  children,
}: {
  active: "/" | "/channels" | "/reports";
  email?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white" aria-hidden>
              <BarChart3 size={16} />
            </span>
            <span className="hidden sm:inline">YouTube Dashboard</span>
          </Link>
          <nav className="ml-2 flex items-center gap-1" aria-label="Main">
            {NAV.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active === href ? "page" : undefined}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm",
                  active === href ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                <Icon size={15} aria-hidden />
                <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {actions}
            <ThemeToggle />
            {email ? (
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  title={`Signed in as ${email}. Sign out`}
                  aria-label="Sign out"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:text-ink"
                >
                  <LogOut size={16} aria-hidden />
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6">{children}</main>
    </div>
  );
}
