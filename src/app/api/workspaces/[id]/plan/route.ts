/**
 * /api/workspaces/[id]/plan — POST: scope + decompose an ambitious build.
 *   { idea } → { size, milestones, brief, existing }
 *
 * The editor calls this BEFORE the first build turn. A simple/standard request
 * comes back with `size` and no milestones — the client just runs its normal
 * single build turn (unchanged). An AMBITIOUS request (a whole-app brief) comes
 * back with an ordered milestone list; the client runs each as its own bounded
 * build turn, so a big build is several achievable turns, not one impossible one.
 *
 * Side effect: the full idea is persisted to `.helix/brief.md` in the workspace
 * so each milestone turn can read the complete spec on demand (the per-turn
 * message stays a compact, focused instruction).
 */

import { z } from "zod";
import { ok } from "@/lib/api-response";
import { guardWorkspace } from "@/lib/route-helpers";
import { estimateScope, surveyExisting, planMilestones } from "@/lib/scope";
import { writeWorkspaceFiles } from "@/lib/workspace";
import { getGitAuth, withGitAuth } from "@/lib/git";
import { MAX_FILE_CHARS } from "@/lib/repo-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BRIEF_PATH = ".helix/brief.md";

// Very high ceiling — this is the endpoint that RECEIVES the full whole-app
// brief, persists it to .helix/brief.md, and decomposes it. It must never 400
// on length (planMilestones slices for the model call; the brief write is
// capped to the per-file limit).
const Schema = z.object({ idea: z.string().min(1).max(100_000) });

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardWorkspace("plan", id, { limit: 60, windowMs: 60 * 60 * 1000 });
  if ("response" in g) return g.response;
  const { user, ws } = g;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // Never block the build on planning — let the client fall back to one turn.
    return ok({ size: "simple", milestones: [], existing: { matched: [] } });
  }
  const idea = parsed.data.idea.trim();

  const scope = estimateScope(idea);

  // A simple/standard request keeps the lean single-turn path — no extra work,
  // no extra tokens. Only an ambitious brief gets decomposed.
  if (scope.size !== "ambitious") {
    return ok({ size: scope.size, milestones: [], existing: { matched: [] } });
  }

  // Survey what's already here so the plan EXTENDS rather than duplicates.
  const existing = await surveyExisting(ws, idea, user.id).catch(() => ({ matched: [] as string[] }));

  const { milestones } = await planMilestones({
    idea,
    userId: user.id,
    features: scope.features,
    existing: existing.matched,
  });

  // Persist the full brief so every milestone turn can read the whole spec on
  // demand (best-effort — the milestones still carry their own detail if this
  // write fails). Sliced to the per-file ceiling.
  try {
    const content = `# Project brief\n\n${idea}`.slice(0, MAX_FILE_CHARS);
    const auth = await getGitAuth(user.id, ws.provider);
    await withGitAuth(auth, () => writeWorkspaceFiles(ws, [{ path: BRIEF_PATH, content }]));
  } catch {
    /* non-fatal — milestones carry their own detail */
  }

  return ok({ size: scope.size, milestones, existing, briefPath: BRIEF_PATH });
}
