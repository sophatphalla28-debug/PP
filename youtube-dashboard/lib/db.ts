import postgres from "postgres";
import { env } from "./env";
import { SCHEMA_SQL } from "./schema";

export type Sql = postgres.Sql;

declare global {
  var __ytdSql: Sql | undefined;
  var __ytdSchemaReady: Promise<void> | undefined;
}

function connect(url: string): Sql {
  return postgres(url, {
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    // Return DATE columns as plain 'YYYY-MM-DD' strings, never JS Dates (avoids timezone shifts).
    types: {
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
    },
    onnotice: () => {},
  });
}

/** Applies lib/schema.ts (idempotent). Serialised with an advisory lock so parallel cold starts don't race. */
export async function applySchema(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(84726341)`;
    await tx.unsafe(SCHEMA_SQL);
  });
}

/** Shared connection pool; the schema is applied once per process before first use. */
export async function db(): Promise<Sql> {
  if (!globalThis.__ytdSql) {
    globalThis.__ytdSql = connect(env().DATABASE_URL);
  }
  const sql = globalThis.__ytdSql;
  if (!globalThis.__ytdSchemaReady) {
    globalThis.__ytdSchemaReady = applySchema(sql).catch((err) => {
      globalThis.__ytdSchemaReady = undefined;
      throw err;
    });
  }
  await globalThis.__ytdSchemaReady;
  return sql;
}

export function createSql(url: string): Sql {
  return connect(url);
}
