/**
 * /api/preferences
 *   GET   → AI provider settings + which secrets are set (never the values)
 *   PATCH → update; empty string clears a secret
 *
 * API keys are PER PROVIDER (openaiKey/anthropicKey/localKey) so switching
 * provider never sends the wrong vendor's key.
 */

import { z } from "zod";
import { db } from "@/lib/db";
import { ok, apiErrors } from "@/lib/api-response";
import { guard } from "@/lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  aiProvider: z.enum(["openai", "anthropic", "local"]).optional(),
  aiModel: z.string().max(120).optional(),
  aiBaseUrl: z.string().max(300).optional(),
  openaiKey: z.string().max(300).optional(),
  anthropicKey: z.string().max(300).optional(),
  localKey: z.string().max(300).optional(),
  githubToken: z.string().max(300).optional(),
});

export async function GET() {
  const g = await guard("prefs", { limit: 300, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const [prefs, githubAccount] = await Promise.all([
    db().userPreferences.findUnique({ where: { userId: g.user.id } }),
    db().account.findFirst({
      where: { userId: g.user.id, provider: "github" },
      select: { access_token: true },
    }),
  ]);
  return ok({
    githubOauthConnected: Boolean(githubAccount?.access_token),
    aiProvider: prefs?.aiProvider ?? "openai",
    aiModel: prefs?.aiModel === "default" ? "" : (prefs?.aiModel ?? ""),
    aiBaseUrl: prefs?.aiBaseUrl ?? "",
    keySet: {
      openai: Boolean(prefs?.openaiKey),
      anthropic: Boolean(prefs?.anthropicKey),
      local: Boolean(prefs?.localKey),
    },
    // Whether the app itself has a key configured per provider (env vars,
    // paid by the app owner) — lets the UI offer "use the shared key".
    serverKeys: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    githubTokenSet: Boolean(prefs?.githubToken),
  });
}

export async function PATCH(req: Request) {
  const g = await guard("prefs", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const p = parsed.data;

  const data: Record<string, string | null> = {};
  if (p.aiProvider !== undefined) data.aiProvider = p.aiProvider;
  if (p.aiModel !== undefined) data.aiModel = p.aiModel.trim() === "default" ? "" : p.aiModel.trim();
  if (p.aiBaseUrl !== undefined) data.aiBaseUrl = p.aiBaseUrl.trim() || null;
  if (p.openaiKey !== undefined) data.openaiKey = p.openaiKey.trim() || null;
  if (p.anthropicKey !== undefined) data.anthropicKey = p.anthropicKey.trim() || null;
  if (p.localKey !== undefined) data.localKey = p.localKey.trim() || null;
  if (p.githubToken !== undefined) data.githubToken = p.githubToken.trim() || null;

  await db().userPreferences.upsert({
    where: { userId: g.user.id },
    create: { userId: g.user.id, ...data },
    update: data,
  });
  return ok({ saved: true });
}
