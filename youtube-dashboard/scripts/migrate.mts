// Applies the database schema (idempotent). Usage: DATABASE_URL=... npm run db:migrate
import postgres from "postgres";
import { SCHEMA_SQL } from "../lib/schema.ts";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, onnotice: () => {} });
await sql.unsafe(SCHEMA_SQL);
const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
console.log("Schema applied. Tables:", tables.map((t) => t.table_name).join(", "));
await sql.end();
