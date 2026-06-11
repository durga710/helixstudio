import type { ChatRequest } from "./provider";

/* Deterministic offline provider. Streams a plan-first answer shaped like the
 * real assistant so the chat UX (streaming, plans, diffs) is fully exercisable
 * without an API key. */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildResponse(req: ChatRequest): string {
  const ask = req.messages.filter((m) => m.role === "user").at(-1)?.content ?? "this change";
  const short = ask.length > 80 ? `${ask.slice(0, 77)}…` : ask;
  return [
    `Here's my plan before touching any code:\n`,
    `**Implementation plan**\n`,
    `1. Understand the request — "${short}"\n`,
    `2. Locate the affected modules and read the surrounding code\n`,
    `3. Implement the change with types and error handling\n`,
    `4. Run Reviewer, Security, and Performance agents on the diff\n`,
    `5. Hand you a reviewed diff to accept or reject\n\n`,
    `I'm running in demo mode (no AI provider key configured), so this is a `,
    `simulated response — add your Anthropic API key in Settings → AI provider to stream `,
    `real ${req.tier === "opus" ? "Opus" : req.tier === "sonnet" ? "Sonnet" : "Haiku"} output. `,
    `The plan-first workflow, diff cards, and agent review pipeline behave exactly the same either way.\n\n`,
    `Want me to proceed with step 1?`,
  ].join("");
}

export async function* mockCompletion(req: ChatRequest): AsyncGenerator<string> {
  const text = buildResponse(req);
  // Stream in word-ish chunks to exercise the streaming UI.
  const chunks = text.match(/\S+\s*|\s+/g) ?? [text];
  for (const chunk of chunks) {
    await sleep(12);
    yield chunk;
  }
}
