import { defineConfig } from "prisma/config";

// Prisma 7 configuration — the datasource URL moved here from schema.prisma.
// DATABASE_URL is optional: without it the app runs in demo mode and only
// migration/introspection commands need the connection string.
export default defineConfig({
  schema: "prisma/schema.prisma",
  ...(process.env.DATABASE_URL ? { datasource: { url: process.env.DATABASE_URL } } : {}),
});
