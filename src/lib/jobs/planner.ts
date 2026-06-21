import "server-only";

/**
 * Planner: decompose a large change into SEQUENTIAL, file-scoped sub-tasks for
 * worker agents. One model call returning JSON; the parser is pure + tested.
 */

import { runOneShotResilient, resolveAiPrefs } from "@/lib/ai-agent";
import { listWorkspaceFiles } from "@/lib/workspace";
import type { Workspace } from "@/generated/prisma/client";
import { parsePlan, type PlannedTask } from "./parse";

export type { PlannedTask };

const PLANNER_SYSTEM =
  "You are the PLANNER for a large code change. Decompose the request into 2-8 file-scoped sub-tasks " +
  "for worker agents. Each sub-task: a short `title`, a `scope` array of file globs it may edit (make " +
  "scopes DISJOINT across sub-tasks wherever possible — disjoint tasks run in PARALLEL, so this is " +
  "what makes the job fast), a concrete `instruction`, an `acceptance` check, and `dependsOn` (array " +
  "of the 0-based indices of earlier tasks that must finish first; omit/empty if independent). Keep " +
  "dependencies minimal so tasks can run concurrently. Reply with ONLY a JSON array, no prose:\n" +
  '[{"title":"...","scope":["app/**"],"instruction":"...","acceptance":"...","dependsOn":[]}]';

/** Run the planner against a workspace + request. Returns [] on failure (caller
 * falls back to a single whole-project task). */
export async function planRefactor(ws: Workspace, userId: string, request: string): Promise<PlannedTask[]> {
  const prefs = await resolveAiPrefs(userId);
  const files = await listWorkspaceFiles(ws).catch(() => []);
  const tree = files.map((f) => f.path).slice(0, 500).join("\n");
  const res = await runOneShotResilient({
    provider: prefs.provider,
    model: prefs.model,
    apiKey: prefs.apiKey,
    baseUrl: prefs.baseUrl,
    maxTokens: 1400,
    system: PLANNER_SYSTEM,
    user: `REQUEST:\n${request}\n\nPROJECT FILES (${files.length}):\n${tree}`,
  });
  if ("error" in res) return [];
  return parsePlan(res.text);
}
