import { Settings } from "lucide-react";

/** Shown instead of the dashboard when environment variables are missing. Lists names only, never values. */
export function SetupRequired({ problems }: { problems: { name: string; message: string }[] }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12">
      <div className="card p-6">
        <div className="mb-3 flex items-center gap-2">
          <Settings size={18} aria-hidden className="text-accent" />
          <h1 className="text-lg font-semibold">Finish setting up your dashboard</h1>
        </div>
        <p className="text-sm text-ink-2">
          These settings are missing or invalid. Add them in Vercel → Project → Settings → Environment Variables (or
          <code className="mx-1 rounded bg-surface-2 px-1">.env.local</code> locally), then redeploy. See the README for step-by-step instructions.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {problems.map((p) => (
            <li key={p.name} className="rounded-lg border border-line bg-page px-3 py-2 text-sm">
              <code className="font-semibold">{p.name}</code>
              <span className="block text-xs text-muted">{p.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
