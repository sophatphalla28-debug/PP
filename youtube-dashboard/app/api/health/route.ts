import { getConfigStatus } from "@/lib/env";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Deployment check: reports whether configuration is complete and the database is reachable. No secrets. */
export async function GET() {
  const config = getConfigStatus();
  let database = false;
  if (config.ok) {
    try {
      const sql = await db();
      await sql`select 1`;
      database = true;
    } catch {
      database = false;
    }
  }
  return Response.json(
    { ok: config.ok && database, configured: config.ok, database, missing: config.problems.map((p) => p.name) },
    { status: config.ok && database ? 200 : 503 },
  );
}
