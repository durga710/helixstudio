/**
 * Provider/model presets shared by the settings page and the in-studio
 * model picker. The model field always accepts ANY id the provider
 * supports — presets are just shortcuts.
 */

/**
 * White-label display names. The Helix house engine runs on OpenAI under the
 * hood, but users only ever see the Helix brand — the raw model id is what we
 * send to the provider; the brand name is what we render. Add a row here to
 * surface a new tier.
 */
export const MODEL_BRAND: Record<string, string> = {
  "gpt-5.4-mini": "Helix 1.0",
  "gpt-5.5": "Helix 2.0",
};

/** The branded display name for a model id, or the id itself when unbranded. */
export function brandModel(modelId: string): string {
  return MODEL_BRAND[modelId] ?? modelId;
}

/** The OpenAI model ids the Helix provider surfaces — fastest tier first.
 *  Full white-label: only these show; every other gpt-* id is hidden. */
export const HELIX_MODELS = ["gpt-5.4-mini", "gpt-5.5"];

export const MODEL_PRESETS: Record<string, { label: string; models: string[]; hint: string }> = {
  openai: {
    // White-labeled: this is the Helix house engine (OpenAI under the hood).
    label: "Helix",
    models: HELIX_MODELS, // shown as Helix 1.0 / Helix 2.0
    hint: "Helix 1.0 is fast and efficient — the default. Helix 2.0 is the most capable for complex builds. Helix's hosted engine; no key needed.",
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
