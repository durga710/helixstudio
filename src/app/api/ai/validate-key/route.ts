/**
 * /api/ai/validate-key — POST { provider }: confirm the AI key that the chat
 * would actually use (the user's saved key, else the server env key) is
 * accepted by the provider, via its CHEAPEST call (a models list). Returns a
 * red/green verdict so the user knows the AI works before they ever chat.
 * Never accepts or echoes a raw key — it validates the SAVED config.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { isAdminEmail } from "@/lib/admin";
import { envKeyFor, GEMINI_BASE_URL } from "@/lib/ai/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const Schema = z.object({ provider: z.enum(["openai", "anthropic", "local", "gemini"]) });

type Verdict = { valid: boolean; usingServerKey: boolean; reason?: string };

async function probe(url: string, headers: Record<string, string>): Promise<Verdict["valid"] | "auth" | "error"> {
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (res.ok) return true;
    if (res.status === 401 || res.status === 403) return "auth";
    return "error";
  } catch {
    return "error";
  }
}

export async function POST(req: Request) {
  const g = await guard("ai.validate", { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { provider } = parsed.data;

  const prefs = await db().userPreferences.findUnique({
    where: { userId: g.user.id },
    select: { openaiKey: true, anthropicKey: true, localKey: true, geminiKey: true, aiBaseUrl: true },
  });

  if (provider === "local") {
    const base = (prefs?.aiBaseUrl || "").replace(/\/+$/, "");
    if (!/^https?:\/\//.test(base)) {
      return ok<Verdict>({ valid: false, usingServerKey: false, reason: "No server URL set" });
    }
    const r = await probe(`${base}/models`, prefs?.localKey ? { Authorization: `Bearer ${prefs.localKey}` } : {});
    return ok<Verdict>({
      valid: r === true,
      usingServerKey: false,
      reason: r === true ? undefined : r === "auth" ? "Server rejected the key" : "Couldn't reach the server",
    });
  }

  const personal =
    provider === "openai" ? prefs?.openaiKey : provider === "anthropic" ? prefs?.anthropicKey : prefs?.geminiKey;
  // The platform (env) key is admin-only — non-admins must bring their own.
  const envKey = isAdminEmail(g.user.email) ? envKeyFor(provider) : undefined;
  const key = personal || envKey;
  if (!key) {
    return ok<Verdict>({
      valid: false,
      usingServerKey: false,
      reason: envKeyFor(provider) ? "No key set — add your own key" : "No API key set",
    });
  }

  const r =
    provider === "openai"
      ? await probe("https://api.openai.com/v1/models", { Authorization: `Bearer ${key}` })
      : provider === "gemini"
        ? await probe(`${GEMINI_BASE_URL}models`, { Authorization: `Bearer ${key}` })
        : await probe("https://api.anthropic.com/v1/models", { "x-api-key": key, "anthropic-version": "2023-06-01" });

  return ok<Verdict>({
    valid: r === true,
    usingServerKey: !personal,
    reason: r === true ? undefined : r === "auth" ? "Invalid API key" : "Couldn't reach the provider",
  });
}
