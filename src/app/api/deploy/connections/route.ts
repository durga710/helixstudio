/**
 * /api/deploy/connections
 *   GET   → which platforms the user has connected (booleans, never tokens) +
 *           the registry (so the UI shows implemented vs coming-soon).
 *   PATCH → save or clear a platform token: { provider, token, config? }.
 *           Empty token clears the connection.
 */

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { DEPLOY_PROVIDERS, getDeployConnections, invalidateDeployAuth, isDeployProviderName } from "@/lib/deploy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("deploy.read", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const connections = await getDeployConnections(g.user.id);
  return ok({ connections, providers: DEPLOY_PROVIDERS });
}

const PatchSchema = z.object({
  provider: z.string(),
  token: z.string().max(400),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: Request) {
  const g = await guard("deploy.write", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { provider, token, config } = parsed.data;
  if (!isDeployProviderName(provider)) return apiErrors.badRequest("Unknown platform.");

  if (!token.trim()) {
    await db().deployConnection.deleteMany({ where: { userId: g.user.id, provider } });
    invalidateDeployAuth(g.user.id);
    return ok({ saved: true, connected: false });
  }

  const configJson = (config ?? undefined) as Prisma.InputJsonValue | undefined;
  await db().deployConnection.upsert({
    where: { userId_provider: { userId: g.user.id, provider } },
    create: { userId: g.user.id, provider, token: token.trim(), config: configJson },
    update: { token: token.trim(), config: configJson },
  });
  invalidateDeployAuth(g.user.id);
  return ok({ saved: true, connected: true });
}
