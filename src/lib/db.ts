import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { SCHEMA_SQL } from "@/lib/schema-sql";
import { UPGRADE_SQL } from "@/lib/schema-upgrades";

/* PostgreSQL access (Prisma 7 + pg driver adapter). Everything DB-backed is
 * gated on DATABASE_URL — without it the app runs in demo mode and this
 * module is never instantiated.
 *
 * Self-bootstrapping: on first use against a fresh database, the schema is
 * created automatically (idempotent). This means connecting DATABASE_URL is
 * the ONLY setup step — no `prisma db push`, no migration job. */

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

const globalDb = globalThis as unknown as {
  __helixPrisma?: PrismaClient;
  __helixSchemaReady?: Promise<void>;
};

/** Create the schema if the database is empty; otherwise apply the additive
 * (idempotent) upgrades so existing databases pick up new tables/columns.
 * Safe to call repeatedly. */
async function ensureSchema(): Promise<void> {
  // DDL prefers the direct (non-pooled) URL when present; PgBouncer poolers
  // are awkward for multi-statement DDL.
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) return;

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const existing = await client.query(`SELECT to_regclass('public."User"') AS t`);
      if (existing.rows[0]?.t) {
        // Already provisioned — apply additive upgrades (no-ops once applied).
        await client.query(`BEGIN;\n${UPGRADE_SQL}\nCOMMIT;`);
        return;
      }
      await client.query(`BEGIN;\n${SCHEMA_SQL}\nCOMMIT;`);
    } finally {
      client.release();
    }
  } catch (err) {
    // A concurrent boot may have created/upgraded it first; re-check rather
    // than fail. Probe the NEWEST schema object so a failed upgrade isn't
    // mistaken for success just because the base tables exist.
    try {
      const c = await pool.connect();
      const r = await c.query(`SELECT to_regclass('public."WorkspaceChange"') AS t`);
      c.release();
      if (r.rows[0]?.t) return;
    } catch {
      /* fall through */
    }
    throw err;
  } finally {
    await pool.end();
  }
}

export function db(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  globalDb.__helixPrisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  return globalDb.__helixPrisma;
}

/** Await this before the first query in a request path that may hit a fresh DB. */
export function schemaReady(): Promise<void> {
  if (!dbEnabled()) return Promise.resolve();
  globalDb.__helixSchemaReady ??= ensureSchema().catch((e) => {
    // Reset so a later request can retry (e.g. transient connection failure).
    globalDb.__helixSchemaReady = undefined;
    throw e;
  });
  return globalDb.__helixSchemaReady;
}
