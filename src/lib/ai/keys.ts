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
 * The final key for a request. User's own key wins; otherwise the platform env
 * key but ONLY for admins. `local` is a bring-your-own-endpoint provider, so it
 * falls back to a dummy key for everyone (many local/custom endpoints need no
 * auth) — but its PLATFORM key (LOCAL_AI_API_KEY, e.g. a paid gateway) stays
 * admin-only.
 */
export function resolveAiKey(opts: { provider: string; userKey?: string | null; isAdmin: boolean }): string | undefined {
  if (opts.userKey) return opts.userKey;
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
  // Bedrock platform default: Sonnet 4.6 balances frontier quality against cost
  // since every signed-in user's build is metered on the platform's AWS bill.
  // Opus 4.6 and Haiku 4.5 remain selectable in Settings → AI model.
  bedrock: "anthropic.claude-sonnet-4-6",
};
