/**
 * POST /api/deployments/refresh — re-poll live status for every deploy the
 * signed-in user owns, across all their workspaces, and update the stored
 * state. Rows without a real platform connection (or whose project the
 * platform can't reach — e.g. seeded fake projects) are skipped gracefully,
 * never throwing. Reuses the exact live-status idiom from the per-workspace
 * deploy GET route.
 */

import { ok } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { getDeployAuth, getDeployProvider } from "@/lib/deploy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const g = await guard("deploy.refresh", { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const rows = await db().workspaceDeploy.findMany({
    where: { workspace: { userId: g.user.id } },
    select: { id: true, provider: true, projectId: true },
    take: 100,
  });

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const provider = getDeployProvider(row.provider);
    const auth = await getDeployAuth(g.user.id, row.provider);
    if (!provider || !provider.implemented || !auth) {
      skipped++;
      continue;
    }
    const status = await provider.status(auth, { projectId: row.projectId });
    if ("error" in status) {
      skipped++;
      continue;
    }
    const done = await db()
      .workspaceDeploy.update({
        where: { id: row.id },
        data: { lastState: status.state, lastDeployAt: new Date() },
      })
      .then(() => true)
      .catch(() => false);
    if (done) updated++;
    else skipped++;
  }

  return ok({ updated, skipped, total: rows.length });
}
