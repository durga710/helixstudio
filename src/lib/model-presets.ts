/**
 * Provider/model presets shared by the settings page and the in-studio
 * model picker. The model field always accepts ANY id the provider
 * supports — presets are just shortcuts.
 */

export const MODEL_PRESETS: Record<string, { label: string; models: string[]; hint: string }> = {
  openai: {
    label: "OpenAI",
    // Only reasoning models that reliably emit tool calls (so builds actually
    // write files). Chat-tuned snapshots (gpt-5-chat-latest, chatgpt-*) are
    // excluded — they narrate edits instead of calling the tools. gpt-5-mini is
    // the snappy default; full gpt-5 is strongest but deliberates per tool hop.
    models: ["gpt-5-mini", "gpt-5", "gpt-4.1"],
    hint: "Default is gpt-5-mini — a reasoning model that reliably calls the build tools and stays snappy. gpt-5 is strongest but slower. Includes built-in web search; any OpenAI model id that supports tool calling works.",
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
