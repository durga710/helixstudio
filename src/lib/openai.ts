import "server-only";
import OpenAI from "openai";

/**
 * OpenAI client singleton (server-only). Model is configurable via
 * OPENAI_MODEL. Returns null if no key is configured so callers can
 * degrade gracefully (users may bring their own key instead).
 *
 * Default is gpt-5-mini — a REASONING model that reliably emits tool calls
 * (write_files/edit_file), so new projects actually build. The previous default
 * (gpt-5-chat-latest) is chat-tuned and tends to narrate edits instead of
 * calling the tools, which left builds empty.
 */
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5-mini";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new OpenAI({ apiKey });
  return client;
}
