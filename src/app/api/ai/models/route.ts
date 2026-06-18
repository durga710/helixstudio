/**
 * /api/ai/models?provider=openai|anthropic|gemini — GET: list the model ids
 * the ACTIVE key can access, so the picker is dynamic per key. The key is
 * resolved server-side exactly like chat: the user's own key wins; the
 * platform (env) key resolves ONLY for admins. No key → empty list (the
 * client falls back to the static presets).
 *
 * `local` is not handled here — it has its own /api/local-models route that
 * lists models off a user-supplied endpoint URL.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { guard } from "@/lib/route-helpers";
import { isAdminEmail } from "@/lib/admin";
import { resolveAiKey, GEMINI_BASE_URL } from "@/lib/ai/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const Schema = z.object({ provider: z.enum(["openai", "anthropic", "gemini"]) });

/** Where to list models, and how to authenticate, per provider. */
function listEndpoint(provider: string, key: string): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case "anthropic":
      return { url: "https://api.anthropic.com/v1/models?limit=100", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    case "gemini":
      return { url: `${GEMINI_BASE_URL}models`, headers: { Authorization: `Bearer ${key}` } };
    default: // openai
      return { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${key}` } };
  }
}

/** Keep only models that can drive an agent chat (drop embeddings, audio,
 * image, tts, moderation, etc.) and normalize the id. */
function chatModels(provider: string, ids: string[]): string[] {
  const NON_CHAT =
    /embed|whisper|tts|dall-?e|audio|image|imagen|veo|lyria|banana|robotics|computer-use|moderation|realtime|transcribe|search|similarity|aqa|learnlm|\bedit\b/i;
  // Chat-tuned snapshots (gpt-5-chat-latest, chatgpt-*) reliably NARRATE edits
  // instead of emitting tool calls, so they can't build — exclude them too.
  const CHAT_TUNED = /chat-latest|^chatgpt/i;
  const out = ids
    // Gemini ids come back as "models/gemini-2.0-flash" — strip the prefix.
    .map((id) => (provider === "gemini" ? id.replace(/^models\//, "") : id))
    .filter((id) => id && !NON_CHAT.test(id) && !CHAT_TUNED.test(id));
  // OpenAI lists dozens of non-chat ids; keep the gpt/o-series families.
  const filtered = provider === "openai" ? out.filter((id) => /^(gpt-|o[1-9])/i.test(id)) : out;
  return Array.from(new Set(filtered)).slice(0, 60);
}

export async function GET(req: Request) {
  const g = await guard("ai.models", { limit: 120, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;

  const parsed = Schema.safeParse({ provider: new URL(req.url).searchParams.get("provider") });
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { provider } = parsed.data;

  const prefs = await db().userPreferences.findUnique({
    where: { userId: g.user.id },
    select: { openaiKey: true, anthropicKey: true, geminiKey: true },
  });
  const userKey =
    provider === "openai" ? prefs?.openaiKey : provider === "anthropic" ? prefs?.anthropicKey : prefs?.geminiKey;
  const key = resolveAiKey({ provider, userKey, isAdmin: isAdminEmail(g.user.email) });
  // No usable key for this user → no live list; the client keeps the presets.
  if (!key) return ok({ models: [], reason: "no-key" });

  const { url, headers } = listEndpoint(provider, key);
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      const reason = res.status === 401 || res.status === 403 ? "auth" : "error";
      return ok({ models: [], reason });
    }
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
    return ok({ models: chatModels(provider, ids) });
  } catch {
    return ok({ models: [], reason: "error" });
  }
}
