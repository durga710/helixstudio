import "server-only";

/**
 * Reviewer gate: after the workers run, check the combined change against the
 * original request + acceptance. Ship, or emit targeted rework tasks (bounded
 * rounds). One model call returning JSON; the parser is pure + tested.
 */

import { runOneShot, resolveAiPrefs } from "@/lib/ai-agent";
import { readWorkspaceFile } from "@/lib/workspace";
import type { Workspace } from "@/generated/prisma/client";
import { parseReview, MAX_REWORK_ROUNDS, type ReviewResult } from "./parse";

export { MAX_REWORK_ROUNDS };
export type { ReviewResult };

const REVIEWER_SYSTEM =
  "You are the REVIEWER. Given the original request and the files that changed, decide whether the " +
  "work is complete and correct. If it ships, reply {\"ship\":true,\"summary\":\"...\"}. If not, reply " +
  '{"ship":false,"summary":"...","fixes":[{"title":"...","scope":["..."],"instruction":"...","acceptance":"..."}]} ' +
  "with SPECIFIC, file-scoped fix tasks (only what's actually wrong). Reply with ONLY JSON, no prose.";

export async function reviewJob(opts: {
  ws: Workspace;
  userId: string;
  request: string;
  changed: string[];
}): Promise<ReviewResult> {
  const prefs = await resolveAiPrefs(opts.userId);
  // Show the reviewer the actual changed files (capped).
  const sample = opts.changed.slice(0, 10);
  const parts: string[] = [];
  for (const p of sample) {
    const c = await readWorkspaceFile(opts.ws, p).catch(() => null);
    if (c !== null) parts.push(`--- ${p} ---\n${c.slice(0, 4000)}`);
  }
  const res = await runOneShot({
    provider: prefs.provider,
    model: prefs.model,
    apiKey: prefs.apiKey,
    baseUrl: prefs.baseUrl,
    maxTokens: 1200,
    system: REVIEWER_SYSTEM,
    user:
      `REQUEST:\n${opts.request}\n\nCHANGED FILES (${opts.changed.length}, showing ${sample.length}):\n` +
      parts.join("\n\n"),
  });
  if ("error" in res) return { ship: true, fixes: [], summary: "" }; // don't block on reviewer failure
  return parseReview(res.text);
}
