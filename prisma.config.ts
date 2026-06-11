import { defineConfig } from "prisma/config";

// Prisma 7 configuration — the datasource URL moved here from schema.prisma.
// Both URLs are optional: without them the app runs in demo mode.
//
// Supabase (and other PgBouncer poolers): the runtime client uses the pooled
// DATABASE_URL (port 6543), but migrations/introspection need a DIRECT_URL
// (port 5432) that bypasses the pooler. Prefer DIRECT_URL for CLI work.
const migrationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
