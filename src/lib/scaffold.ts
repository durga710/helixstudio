import "server-only";

/**
 * Shared scaffold injection.
 *
 * The first build turn on an EMPTY from-scratch workspace gets a premium-gated
 * starter skeleton injected BEFORE building, so the agent customizes a real,
 * runnable framework (cheap) and the preview renders instead of staying blank.
 * Extracted from agent-turn so BOTH the sequential loop and the turbo path
 * scaffold identically — turbo then generates the delta on top of the skeleton.
 */

import type { Workspace } from "@/generated/prisma/client";
import { writeWorkspaceFiles, type WorkspaceFileEntry } from "@/lib/workspace";
import { db } from "@/lib/db";
import { resolveTemplateId } from "@/lib/templates/select";
import { getTemplate } from "@/lib/templates/store";
import { buildTemplateNote } from "@/lib/templates/router";
import { personalizeTemplateFiles } from "@/lib/templates/personalize";

export interface ScaffoldResult {
  /** True when a starter was injected this turn (first build phrasing + folds
   *  the whole framework into the change set). */
  scaffolded: boolean;
  /** Every file written by the injection (the whole framework). */
  scaffoldPaths: string[];
  /** Current tree — the new skeleton when scaffolded, else unchanged. */
  files: WorkspaceFileEntry[];
  /** Model-facing project notes (the skeleton brief), or the prior notes. */
  notes: string | null;
}

/**
 * Inject the starter skeleton when this is the first build of an empty SCRATCH
 * workspace; otherwise a no-op that returns the current state. Best-effort: a
 * broken template logs and falls through to building from scratch.
 */
export async function ensureScaffold(opts: {
  ws: Workspace;
  userId: string;
  userMessage: string;
  /** The workspace tree as the caller already listed it (to decide "empty"). */
  currentFiles: WorkspaceFileEntry[];
  emit: (label: string) => void;
  /** Live "scaffold" event so the client can play a building feed. */
  onScaffold?: (files: string[], stack: string) => void;
  /** Re-list the tree after injection (caller supplies its git-auth wrapping). */
  relist: () => Promise<WorkspaceFileEntry[]>;
}): Promise<ScaffoldResult> {
  const { ws, userId, userMessage, currentFiles, emit, onScaffold, relist } = opts;
  const unchanged: ScaffoldResult = {
    scaffolded: false,
    scaffoldPaths: [],
    files: currentFiles,
    notes: ws.notes,
  };
  if (!(ws.mode === "SCRATCH" && currentFiles.length === 0 && !ws.notes && userMessage.trim())) {
    return unchanged;
  }
  try {
    const templateId = await resolveTemplateId({
      prompt: userMessage,
      userId,
      buildKind: ws.kind === "game" ? "game" : "app",
      // Respect the sub-type the user picked at creation (e.g. a 3D game).
      gameCategory: ws.gameCategory ?? undefined,
    });
    const tpl = templateId ? await getTemplate(templateId) : undefined;
    if (!tpl) return unchanged;

    emit("scaffolding a starter…");
    const tplFiles = personalizeTemplateFiles(tpl.files, { appName: ws.name });
    // AGENTS.md/CLAUDE.md in a skeleton is MODEL-FACING build guidance, not part
    // of the user's app — keep it out of the workspace and feed it as notes.
    const isBrief = (p: string) => /(^|\/)(AGENTS|CLAUDE)\.md$/i.test(p);
    const briefDoc = tplFiles.filter((f) => isBrief(f.path)).map((f) => f.content).join("\n\n").trim();
    const projectFiles = tplFiles.filter((f) => !isBrief(f.path));
    const note = (briefDoc || buildTemplateNote(tpl)).slice(0, 3000);

    const wrote = await writeWorkspaceFiles(ws, projectFiles.map((f) => ({ path: f.path, content: f.content })));
    if ("error" in wrote) throw new Error(`template injection failed: ${wrote.error}`);
    await db().workspace.update({ where: { id: ws.id }, data: { notes: note } });
    ws.notes = note; // reflect it in this turn's context

    const files = await relist().catch(() => currentFiles);
    const treePaths = files.map((f) => f.path);
    onScaffold?.(treePaths, tpl.manifest.label);
    return { scaffolded: true, scaffoldPaths: [...treePaths], files, notes: note };
  } catch (e) {
    // best-effort — log so a broken template (bad path, oversize file) is visible
    // instead of silently empty, then build from scratch.
    console.error("[scaffold] template injection skipped:", e);
    return unchanged;
  }
}
