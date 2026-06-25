/**
 * /api/workspaces/[id]/ledger/ask — POST { path, line, question }
 *   question "why"    → "Why does this line exist?"
 *   question "impact" → "What breaks if I remove it?"
 *
 * One no-tools model call grounded in the line's stored provenance: the
 * intent that introduced it, the surrounding code, protecting tests, and
 * (for impact) the later intents layered on top of the file.
 */

import { z } from "zod";
import { ok, apiErrors } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { readWorkspaceFile } from "@/lib/workspace";
import { computeLineLedger, normalizeEol } from "@/lib/intent-ledger";
import { runOneShot, resolveAiPrefs } from "@/lib/ai-agent";
import { brandProviderError } from "@/lib/ai/provider-errors";
import { guardWorkspace } from "@/lib/route-helpers";
import { checkTokenBudget } from "@/lib/token-budget";
import { recordAiUsage } from "@/lib/ai-usage";
import { err } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 60;

const AskSchema = z.object({
  path: z.string().min(1).max(200),
  line: z.number().int().min(1).max(100_000),
  question: z.enum(["why", "impact"]),
});

const WHY_SYSTEM =
  "You are Helix's code historian. Using ONLY the provenance record below, explain in 3-6 sentences why the " +
  "marked line of code exists: what user request introduced it, what role it plays in that change, and which plan " +
  "step (if any) it implements. If tests protect it, name them. Do not speculate beyond the record and the code " +
  "excerpt — if the record is thin, say so plainly.";

const IMPACT_SYSTEM =
  "You are Helix's impact analyst. Given the marked line, its surrounding code, the intent that introduced it, " +
  "tests that reference this file, and the later changes layered on top, answer: what functionality degrades or " +
  "breaks if this line is removed? Be concrete — name symbols, files, and user-visible behavior. 4-8 sentences, " +
  "then one final line exactly in the form: `Risk: low | medium | high — <reason>`.";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("ledger.ask", id, { limit: 30, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrors.badRequest("Request body must be valid JSON");
  }
  const parsed = AskSchema.safeParse(body);
  if (!parsed.success) return apiErrors.validation(parsed.error);
  const { path, line, question } = parsed.data;

  const auth = await getGitAuth(ws.userId, ws.provider);
  const [ledger, raw] = await withGitAuth(auth, async () =>
    Promise.all([computeLineLedger(ws, path), readWorkspaceFile(ws, path)]),
  );
  if (raw === null) return apiErrors.notFound("File");

  const lines = normalizeEol(raw).split("\n");
  if (line > lines.length) return apiErrors.badRequest("line is past the end of the file");

  const range = ledger.ranges.find((r) => line >= r.start && line <= r.end);
  const intent = range?.intentId && range.intentId !== "uncaptured" ? ledger.intents[range.intentId] : null;

  // ±20 lines of context with the line marked.
  const from = Math.max(0, line - 21);
  const to = Math.min(lines.length, line + 20);
  const excerpt = lines
    .slice(from, to)
    .map((l, i) => `${from + i + 1 === line ? ">>>" : "   "} ${from + i + 1}: ${l}`)
    .join("\n");

  let record =
    `FILE: ${path}\nMARKED LINE ${line}:\n${excerpt}\n\n` +
    (intent
      ? `INTRODUCED BY (${intent.kind} change, ${intent.createdAt}): ${intent.title}\n` +
        `USER REQUEST:\n${intent.userRequest.slice(0, 2000)}\n` +
        (intent.planText ? `\nAPPROVED PLAN:\n${intent.planText.slice(0, 3000)}\n` : "") +
        (intent.reasoning ? `\nAGENT'S SUMMARY OF THE CHANGE:\n${intent.reasoning.slice(0, 2000)}\n` : "") +
        (intent.alternatives ? `\nREJECTED ALTERNATIVES:\n${intent.alternatives.slice(0, 1000)}\n` : "") +
        `\nOTHER FILES IN THE SAME CHANGE: ${intent.paths.filter((p) => p !== path).join(", ") || "(none)"}\n`
      : range?.intentId === "uncaptured"
        ? "PROVENANCE: this line was edited outside captured history (the record is thin).\n"
        : `PROVENANCE: this line predates the ledger — it comes from ${ws.mode === "IMPORT" ? "the imported repository" : "before history was captured"}.\n`) +
    `\nTESTS REFERENCING THIS FILE: ${ledger.tests.join(", ") || "(none found)"}\n`;

  if (question === "impact" && intent) {
    const later = await db().workspaceChange.findMany({
      where: { workspaceId: ws.id, path, intent: { createdAt: { gt: new Date(intent.createdAt) } } },
      select: { intent: { select: { title: true, kind: true, createdAt: true } } },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    record +=
      `\nLATER CHANGES TO THIS FILE:\n` +
      (later.length
        ? later.map((c) => `- ${c.intent.title} (${c.intent.kind}, ${c.intent.createdAt.toISOString()})`).join("\n")
        : "(none)");
  }

  const budget = await checkTokenBudget(user.id);
  if (!budget.ok) return err(budget.code, budget.error, 403);

  const ai = await resolveAiPrefs(user.id);
  const result = await runOneShot({
    ...ai,
    system: question === "why" ? WHY_SYSTEM : IMPACT_SYSTEM,
    user: record.slice(0, 24_000),
  });
  if ("error" in result) return apiErrors.badRequest(brandProviderError(result.error));

  // Meter the spend like every other AI route.
  await recordAiUsage({
    userId: user.id,
    tokens: result.tokensUsed,
    kind: "ledger_ask",
    provider: ai.provider,
    model: ai.model,
    workspaceId: ws.id,
  });

  return ok({ text: result.text || "(no answer produced)" });
}
