#!/usr/bin/env node
// One-shot Postgres migration runner.
// Usage: node --env-file=.env.local scripts/db-migrate.mjs <path-to-sql>
//
// Reads DATABASE_URL from the loaded env file, opens a single connection,
// executes the given SQL file inside a transaction, and reports.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const [, , migrationPath] = process.argv;
if (!migrationPath) {
  console.error("Usage: node --env-file=.env.local scripts/db-migrate.mjs <path-to-sql>");
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Grab it from Supabase dashboard → Project Settings → Database → Connection string (URI tab) and add to .env.local",
  );
  process.exit(2);
}

const absPath = resolve(process.cwd(), migrationPath);
let sql;
try {
  sql = readFileSync(absPath, "utf8");
} catch (err) {
  console.error(`Failed to read ${absPath}: ${err.message}`);
  process.exit(2);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

console.log(`→ Connecting to Postgres...`);
await client.connect();

console.log(`→ Applying ${migrationPath} (${sql.length.toLocaleString()} chars)`);
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("✓ Migration applied.");
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error(`✗ Migration failed: ${err.message}`);
  if (err.position) console.error(`  (at SQL position ${err.position})`);
  process.exit(1);
} finally {
  await client.end();
}
