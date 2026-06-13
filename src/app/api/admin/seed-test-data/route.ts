/**
 * Admin-only: seed (or wipe) the test-data accounts. POST rebuilds a full,
 * realistic graph of real DB rows under the @seed.helix.test users so every
 * page can be exercised with believable data; DELETE removes them. Both are
 * idempotent and only ever touch the seed email allowlist.
 */

import { ok, apiErrors } from "@/lib/api-response";
import { dbEnabled } from "@/lib/db";
import { guardAdmin } from "@/lib/route-helpers";
import { seedTestData, wipeTestData } from "@/lib/seed-test-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured (demo mode).");
  const summary = await seedTestData();
  console.log(`[admin] ${g.admin.email} seeded test data`, summary.counts);
  return ok(summary);
}

export async function DELETE() {
  const g = await guardAdmin();
  if ("response" in g) return g.response;
  if (!dbEnabled()) return apiErrors.badRequest("No database configured (demo mode).");
  const res = await wipeTestData();
  console.log(`[admin] ${g.admin.email} wiped test data`, res);
  return ok(res);
}
