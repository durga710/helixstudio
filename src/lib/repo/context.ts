import { activeProject, activeWorkspace } from "@/lib/store";
import { searchRepo } from "./search";

/* Repository context assembly (Phase 2 → chat/agents).
 * Builds a compact, token-bounded view of the active workspace: project
 * summary, file map, and the chunks most relevant to the user's request. */

const MAX_CONTEXT_CHARS = 9_000;
const MAX_FILE_CHARS = 2_400;

export function workspaceContext(query: string): string {
  const project = activeProject();
  const ws = activeWorkspace();
  const parts: string[] = [];

  parts.push(
    `## Active repository: ${project?.name ?? "workspace"} (${project?.repoUrl ?? "local"})`,
    ws.analysis.overview.map((o) => `${o.k}: ${o.v}`).join(" · "),
    `Files indexed: ${ws.files.length}`
  );

  parts.push("## File map", ws.files.slice(0, 80).map((f) => f.path).join("\n"));

  // Most relevant files for this request, by the lexical scorer.
  const hits = searchRepo(query, 4);
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.path)) continue;
    seen.add(hit.path);
    const file = ws.files.find((f) => f.path === hit.path);
    if (!file) continue;
    const body =
      file.content.length > MAX_FILE_CHARS ? `${file.content.slice(0, MAX_FILE_CHARS)}\n… (truncated)` : file.content;
    parts.push(`## ${file.path}`, "```" + (file.language || "").toLowerCase(), body, "```");
  }

  let out = parts.join("\n");
  if (out.length > MAX_CONTEXT_CHARS) out = `${out.slice(0, MAX_CONTEXT_CHARS)}\n… (context truncated)`;
  return out;
}
