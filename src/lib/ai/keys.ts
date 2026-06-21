/**
 * Central AI key resolution. One rule everywhere:
 *   the user's OWN key always works; the PLATFORM (env) key resolves ONLY for
 *   admins. Non-admins (and guests) must bring their own key.
 *
 * Reads non-public env vars (never NEXT_PUBLIC_*), so importing this on the
 * client is harmless — the env reads are server-only at runtime.
 */

/** Gemini speaks the OpenAI API over this base URL. */
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

/** The platform env key for a provider (admin-only — gate before using). */
export function envKeyFor(provider: string): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "gemini":
      return process.env.GEMINI_API_KEY;
    case "local":
      return process.env.LOCAL_AI_API_KEY;
    default:
      return undefined;
  }
}

/**
 * House OpenAI mode: when `OPENAI_FOR_ALL=1` AND `OPENAI_API_KEY` is set, the
 * platform OpenAI key serves EVERY user (not just admins) — the operator is
 * deliberately footing the bill so all builds run on a strong GPT model. The
 * normal per-user token quota still meters spend. Off by default.
 */
export function openaiHouseForAll(): boolean {
  return process.env.OPENAI_FOR_ALL === "1" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Premium access — unlocks the Helix (house OpenAI) models. Free and guest users
 * are limited to the Gunner free models (Bedrock GPT-OSS). Paid subscribers
 * (pro/team) and admins qualify. Pure (no DB) — the caller passes the tier it
 * already loaded.
 */
export function canUseHelix(opts: { tier?: string | null; isGuest?: boolean; isAdmin?: boolean }): boolean {
  if (opts.isAdmin) return true;
  if (opts.isGuest) return false;
  return opts.tier === "pro" || opts.tier === "team";
}

/**
 * The default provider when the user hasn't picked one. Premium subscribers get
 * the Helix house engine (OpenAI) when it's enabled; everyone else gets the
 * Gunner free engine (Bedrock) when wired; otherwise OpenAI. `bedrockWired` is
 * passed in to avoid importing the Bedrock module here.
 */
export function defaultAiProvider(bedrockWired: boolean, premium: boolean): string {
  if (openaiHouseForAll() && premium) return "openai";
  return bedrockWired ? "bedrock" : "openai";
}

/**
 * The final key for a request. User's own key wins; the house OpenAI (Helix) key
 * serves PREMIUM subscribers when enabled; otherwise the platform env key but
 * ONLY for admins. `local` is a bring-your-own-endpoint provider, so it falls
 * back to a dummy key for everyone — but its PLATFORM key stays admin-only.
 */
export function resolveAiKey(opts: { provider: string; userKey?: string | null; isAdmin: boolean; premium?: boolean }): string | undefined {
  if (opts.userKey) return opts.userKey;
  // House OpenAI (Helix) key — PREMIUM subscribers only. Trim it: a trailing
  // newline from a dashboard paste makes the API reject it with 401.
  if (opts.provider === "openai" && openaiHouseForAll() && opts.premium) {
    const houseKey = envKeyFor("openai")?.trim();
    if (houseKey) return houseKey;
  }
  const env = opts.isAdmin ? envKeyFor(opts.provider) : undefined;
  if (env) return env;
  if (opts.provider === "local") return "local";
  return undefined;
}

/** Default model per provider when the user hasn't picked one. */
export const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  openai: "", // falls through to OPENAI_MODEL
  anthropic: "claude-sonnet-4-6",
  local: "llama3.1",
  gemini: "gemini-2.0-flash",
  // Bedrock platform default: GPT-OSS 120B — the strongest model this AWS
  // account actually has access to (verified live 2026-06-19: 200 + clean
  // tool_calls). Open-weight, so it's cheap on the platform's metered bill.
  // Every Claude id is currently 403/404 on this account (no entitlement —
  // see docs/BEDROCK-MODEL-ACCESS.md), so a Claude default would dead-end.
  // Free-tier default = Gunner 1.0 (the 20B): cheaper/faster for the free plan.
  // Gunner Max (120B) is the upgrade and the house→Helix fallback target.
  bedrock: "openai.gpt-oss-20b-1:0",
};
