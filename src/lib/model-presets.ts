/**
 * Provider/model presets shared by the settings page and the in-studio
 * model picker. The model field always accepts ANY id the provider
 * supports — presets are just shortcuts.
 *
 * WHITE-LABEL: users never see a raw OpenAI id. Every gpt-* / o* / sora / media
 * id resolves to a Helix brand named for its CAPABILITY (not its version), and
 * the model picker shows each model's TPM (tokens/min) ceiling on our account.
 * brandModel() is pattern-based so any id the active key returns is branded.
 */

/* ------------------------- capability white-label ------------------------- */

/** Normalize an id to its base form: drop date stamps, -shared/-alpha/-preview,
 *  fine-tune prefixes, and the OpenAI-compat "openai." Bedrock prefix. */
function baseModelId(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/^ft:/, "")
    .replace(/^openai\./, "")
    .replace(/[:-]\d{4}-\d{2}-\d{2}.*$/, "")
    .replace(/-(shared|alpha|preview|latest|v\d+)$/g, "")
    .trim();
}

/** Map a model id to its capability-based Helix brand. Pattern-based: a new
 *  gpt-* / o* id is branded by what it DOES, so the catalog never goes stale. */
export function brandModel(modelId: string): string {
  if (!modelId) return "default";
  const m = baseModelId(modelId);

  // Media + non-chat capabilities.
  if (m.includes("sora")) return m.includes("pro") ? "HelixVideo Pro" : "HelixVideo";
  if (m.includes("image")) return "HelixImage";
  if (m.includes("transcribe") || m.includes("whisper")) return "HelixScribe";
  if (m.includes("tts") || m.includes("audio")) return "HelixVoice";
  if (m.includes("embedding")) return "HelixEmbed";
  if (m.includes("moderation")) return "HelixGuard";
  if (m.includes("realtime")) return "HelixLive";

  // o-series = deep reasoning.
  if (/^o\d/.test(m)) return m.includes("mini") ? "Helix Reason Mini" : m.includes("pro") ? "Helix Reason Pro" : "Helix Reason";

  // gpt chat/build family — named by capability, with a "long context" suffix.
  if (m.startsWith("gpt-5") || m.startsWith("gpt-4") || m.startsWith("gpt-3") || m === "chat") {
    const longCtx = m.includes("long-context") ? " (long context)" : "";
    let name: string;
    if (m.includes("codex")) {
      name = m.includes("max") ? "Helix Code Max" : m.includes("mini") ? "Helix Code Mini" : "Helix Code";
    } else if (m.includes("nano")) {
      name = "Helix Nano";
    } else if (m.includes("mini")) {
      name = "Helix Mini";
    } else if (m.includes("pro")) {
      name = "Helix Pro";
    } else if (m.startsWith("gpt-4") || m.startsWith("gpt-3")) {
      name = "Helix Lite";
    } else {
      name = "Helix Core";
    }
    return name + longCtx;
  }

  // Unknown id (a BYO/local model) — show it as-is.
  return modelId;
}

/* ------------------------------- TPM table -------------------------------- */

export interface ModelRate {
  /** Tokens per minute ceiling on the platform account (null = not token-metered). */
  tpm: number | null;
  /** Requests per minute ceiling. */
  rpm: number | null;
}

/**
 * Per-model rate limits on the platform OpenAI account, keyed by base id.
 * Source: the account's provider rate-limit dashboard (operator-supplied).
 * Update here when the account tier changes.
 */
export const MODEL_RATES: Record<string, ModelRate> = {
  // gpt-5.5 line
  "gpt-5.5-pro": { tpm: 200_000, rpm: 500 },
  "gpt-5.5": { tpm: 1_000_000, rpm: 5_000 },
  // gpt-5.4 line
  "gpt-5.4-pro": { tpm: 1_000_000, rpm: 5_000 },
  "gpt-5.4": { tpm: 1_000_000, rpm: 5_000 },
  "gpt-5.4-mini": { tpm: 2_000_000, rpm: 5_000 },
  "gpt-5.4-nano": { tpm: 2_000_000, rpm: 5_000 },
  // gpt-5.1/5.2/5.3 codex + base
  "gpt-5.3-codex": { tpm: 1_000_000, rpm: 5_000 },
  "gpt-5.2-codex": { tpm: 1_000_000, rpm: 5_000 },
  "gpt-5.2-pro": { tpm: 1_000_000, rpm: 5_000 },
  "gpt-5.2": { tpm: 1_000_000, rpm: 5_000 },
  "gpt-5.1-codex-max": { tpm: 1_000_000, rpm: 5_000 },
  "gpt-5.1-codex-mini": { tpm: 2_000_000, rpm: 5_000 },
  "gpt-5.1-codex": { tpm: 1_000_000, rpm: 5_000 },
  "gpt-5.1": { tpm: 1_000_000, rpm: 5_000 },
  // gpt-5 base
  "gpt-5-pro": { tpm: 450_000, rpm: 5_000 },
  "gpt-5-codex": { tpm: 1_000_000, rpm: 5_000 },
  "gpt-5-mini": { tpm: 2_000_000, rpm: 5_000 },
  "gpt-5-nano": { tpm: 2_000_000, rpm: 5_000 },
  "gpt-5": { tpm: 1_000_000, rpm: 5_000 },
  // reasoning
  "o4-mini": { tpm: 2_000_000, rpm: 5_000 },
  "o3-mini": { tpm: 2_000_000, rpm: 5_000 },
  "o3": { tpm: 450_000, rpm: 5_000 },
  "o1-pro": { tpm: 450_000, rpm: 5_000 },
  "o1": { tpm: 450_000, rpm: 5_000 },
  // legacy
  "gpt-3.5-turbo": { tpm: 2_000_000, rpm: 5_000 },
  // media (operator-supplied: video carries very high TPM ceilings)
  "sora-2": { tpm: 1_000_000_000, rpm: 50 },
  "sora-2-pro": { tpm: 100_000_000, rpm: 25 },
  "gpt-image": { tpm: 250_000, rpm: 20 },
};

/** The rate limits for a model id (base-normalized), or nulls if unknown. */
export function modelRate(modelId: string): ModelRate {
  return MODEL_RATES[baseModelId(modelId)] ?? { tpm: null, rpm: null };
}

/** A compact human label for a TPM number: 1e9 → "1B", 2e6 → "2M", 450e3 → "450K". */
export function formatTpm(tpm: number | null): string | null {
  if (tpm == null) return null;
  if (tpm >= 1_000_000_000) return `${(tpm / 1_000_000_000).toFixed(tpm % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (tpm >= 1_000_000) return `${(tpm / 1_000_000).toFixed(tpm % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tpm >= 1_000) return `${Math.round(tpm / 1_000)}K`;
  return String(tpm);
}

/* ------------------------------- presets ---------------------------------- */

/** The OpenAI model ids the Helix provider surfaces — a capability lineup,
 *  fastest first. Full white-label: only these show; every other gpt-* id is
 *  hidden from the picker (but still brands correctly if a key returns it). */
export const HELIX_MODELS = ["gpt-5.4-mini", "gpt-5.5", "gpt-5.5-pro", "gpt-5.2-codex"];

export const MODEL_PRESETS: Record<string, { label: string; models: string[]; hint: string }> = {
  openai: {
    // White-labeled: this is the Helix house engine (OpenAI under the hood).
    label: "Helix",
    models: HELIX_MODELS, // Helix Mini / Helix Core / Helix Pro / Helix Code
    hint: "Helix Mini is fast and efficient — the default. Helix Core balances speed and depth; Helix Pro is the most capable; Helix Code specializes in large builds. Helix's hosted engine; no key needed.",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-fable-5", "claude-haiku-4-5-20251001"],
    hint: "Strong agentic tool use. Any Claude model id works.",
  },
  gemini: {
    label: "Google (Gemini)",
    models: ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro"],
    hint: "Google Gemini via its OpenAI-compatible API. Any Gemini model id works — the model must support tool calling to write files.",
  },
  local: {
    label: "Custom / Local",
    models: ["google/gemma-4-26b-a4b-qat", "qwen2.5-coder:14b", "llama3.1"],
    hint:
      "Any OpenAI-compatible endpoint: LM Studio or Ollama on your machine, or hosted gateways like OpenRouter/Groq/Together (their URL + your key). The model must support tool calling or it can't write files.",
  },
};

export const DEFAULT_BASE_URLS: Record<string, string> = {
  lmstudio: "http://localhost:1234/v1",
  ollama: "http://localhost:11434/v1",
};
