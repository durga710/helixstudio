import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/* PostgreSQL access (Prisma 7 + pg driver adapter). Everything DB-backed is
 * gated on DATABASE_URL — without it the app runs in demo mode and this
 * module is never instantiated. */

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

const globalDb = globalThis as unknown as { __helixPrisma?: PrismaClient };

export function db(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  globalDb.__helixPrisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  return globalDb.__helixPrisma;
}
