import { z } from "zod";

/**
 * Server-side configuration. Read lazily so `next build` works without secrets;
 * pages call `getConfigStatus()` to show a setup screen instead of crashing.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL (or POSTGRES_URL) is required"),
  APP_URL: z.url("APP_URL must be a full URL, e.g. https://yt.example.com"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ALLOWED_EMAILS: z.string().min(3),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
});

export type AppEnv = z.infer<typeof schema> & { allowedEmails: string[] };

function rawEnv() {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return {
    DATABASE_URL: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
    APP_URL: (process.env.APP_URL || (vercelUrl ? `https://${vercelUrl}` : "")).replace(/\/+$/, ""),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? "",
    SESSION_SECRET: process.env.SESSION_SECRET ?? "",
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY ?? "",
    CRON_SECRET: process.env.CRON_SECRET ?? "",
  };
}

let cached: AppEnv | null = null;

export function env(): AppEnv {
  if (cached) return cached;
  const parsed = schema.parse(rawEnv());
  cached = {
    ...parsed,
    allowedEmails: parsed.ALLOWED_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  };
  return cached;
}

/** Names (never values) of settings that are missing or invalid. */
export function getConfigStatus(): { ok: boolean; problems: { name: string; message: string }[] } {
  const result = schema.safeParse(rawEnv());
  if (result.success) return { ok: true, problems: [] };
  return {
    ok: false,
    problems: result.error.issues.map((i) => ({ name: String(i.path[0]), message: i.message })),
  };
}

export function redirectUri(): string {
  return `${env().APP_URL}/api/auth/callback`;
}

export function isSecureApp(): boolean {
  return env().APP_URL.startsWith("https://");
}

/** Test hook: lets the end-to-end suite point Google calls at a local mock. Ignored on Vercel. */
export function googleMockBase(): string | null {
  const url = process.env.TEST_ONLY_GOOGLE_MOCK_URL;
  if (!url || process.env.VERCEL) return null;
  return url.replace(/\/+$/, "");
}
