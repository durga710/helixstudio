import "server-only";

/**
 * The AI's hands inside a workspace: list, read, write, and delete files in
 * the virtual overlay. The UI reflects every change after the chat turn via
 * the change manifest the chat route returns.
 *
 * `web_search` is OpenAI's built-in browsing tool (executed by OpenAI);
 * non-OpenAI providers just don't get it.
 */

import { getWorkspaceForUser, listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFiles, deleteWorkspaceFile, type WorkspaceFileEntry } from "@/lib/workspace";
import { validateFiles, MAX_TOOL_FILES } from "@/lib/repo-files";
import { setProgress } from "@/lib/progress";
import { db } from "@/lib/db";
import { NOTES_MAX } from "@/lib/chat-context";

/** Live activity label for a tool call — shown in the chat while it runs. */
function progressLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "list_files":
      return "scanning the file tree…";
    case "read_file":
      return `reading ${typeof args.path === "string" ? args.path : "a file"}…`;
    case "write_files": {
      const files = Array.isArray(args.files) ? args.files : [];
      const first = files[0] as { path?: string } | undefined;
      return files.length === 1 && first?.path
        ? `writing ${first.path}…`
        : `writing ${files.length} file(s)…`;
    }
    case "delete_file":
      return `deleting ${typeof args.path === "string" ? args.path : "a file"}…`;
    case "remember":
      return "updating project notes…";
    default:
      return "working…";
  }
}

export interface ToolContext {
  userId: string;
  workspaceId: string;
  /**
   * Request-scoped cache. The chat route primes `tree` with the listing it
   * already fetched for the system prompt, so list_files inside the same turn
   * doesn't refetch the GitHub tree; writes/deletes invalidate it.
   */
  cache?: { tree?: WorkspaceFileEntry[] };
}

const READ_CAP = 24_000;

export const WORKSPACE_TOOLS = [
  { type: "web_search" as const },
  {
    type: "function" as const,
    name: "list_files",
    description:
      "List every file in the workspace (path + size). The workspace is the project — use this to see what exists before reading or writing.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: false,
  },
  {
    type: "function" as const,
    name: "read_file",
    description:
      "Read one file's full content from the workspace. ALWAYS read a file before modifying it so your rewrite keeps everything that should stay.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "workspace-relative path, e.g. src/app.ts" } },
      required: ["path"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function" as const,
    name: "write_files",
    description:
      "Write up to " +
      MAX_TOOL_FILES +
      " files to the workspace in one call (create or overwrite). Content must be the COMPLETE file — never a diff or snippet. This is THE build tool: the user watches files appear/update live in their editor.",
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: { path: { type: "string" }, content: { type: "string" } },
            required: ["path", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["files"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function" as const,
    name: "delete_file",
    description: "Delete one file from the workspace.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function" as const,
    name: "remember",
    description:
      "Maintain the PROJECT NOTES doc shown to you at the start of every turn: stack choices, " +
      "conventions, key decisions, gotchas. Pass the COMPLETE new doc — it replaces the old one " +
      "(max " +
      NOTES_MAX +
      " chars; keep it tight, bullet style). Use it after meaningful decisions, not every turn.",
    parameters: {
      type: "object",
      properties: {
        notes: { type: "string", description: "the full replacement notes doc" },
      },
      required: ["notes"],
      additionalProperties: false,
    },
    strict: false,
  },
];

const s = (v: unknown): string => (typeof v === "string" ? v : "");

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  setProgress(ctx.workspaceId, progressLabel(name, args));
  try {
    return await executeToolInner(name, args, ctx);
  } finally {
    // Back to the model deliberating until the next tool call.
    setProgress(ctx.workspaceId, "thinking…");
  }
}

async function executeToolInner(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const ws = await getWorkspaceForUser(ctx.workspaceId, ctx.userId);
  if (!ws) return { error: "workspace not found" };

  switch (name) {
    case "list_files": {
      const files = ctx.cache?.tree ?? (await listWorkspaceFiles(ws));
      if (ctx.cache) ctx.cache.tree = files;
      return { count: files.length, files: files.map((f) => ({ path: f.path, size: f.size })) };
    }
    case "read_file": {
      const path = s(args.path);
      if (!path) return { error: "path is required" };
      const content = await readWorkspaceFile(ws, path);
      if (content === null) return { error: `${path} not found (or is binary/too large)` };
      return {
        path,
        content: content.slice(0, READ_CAP),
        truncated: content.length > READ_CAP,
      };
    }
    case "write_files": {
      const rawFiles = Array.isArray(args.files) ? args.files : [];
      const files = rawFiles.map((f) => {
        const o = f && typeof f === "object" ? (f as Record<string, unknown>) : {};
        return { path: s(o.path), content: typeof o.content === "string" ? o.content : "" };
      });
      const check = validateFiles(files, MAX_TOOL_FILES);
      if (!check.ok) return { error: check.error };
      const result = await writeWorkspaceFiles(ws, files);
      if ("error" in result) return result;
      if (ctx.cache) ctx.cache.tree = undefined; // listing changed
      return { written: true, count: files.length, writtenPaths: result.writtenPaths };
    }
    case "delete_file": {
      const path = s(args.path);
      if (!path) return { error: "path is required" };
      const result = await deleteWorkspaceFile(ws, path);
      if ("error" in result) return result;
      if (ctx.cache) ctx.cache.tree = undefined; // listing changed
      return { deleted: true, deletedPaths: result.deletedPaths };
    }
    case "remember": {
      const notes = s(args.notes).trim();
      if (!notes) return { error: "notes is required" };
      if (notes.length > NOTES_MAX) {
        return { error: `notes too long — max ${NOTES_MAX} characters; tighten it up` };
      }
      await db().workspace.update({ where: { id: ws.id }, data: { notes } });
      return { saved: true };
    }
    default:
      return { error: `unknown tool: ${name}` };
  }
}

/** Short human label for an executed tool, for the chat's "actions taken" line. */
export function toolLabel(name: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  switch (name) {
    case "web_search":
      return "searched the web";
    case "list_files":
      return r.count !== undefined ? `listed ${String(r.count)} file(s)` : "listed files";
    case "read_file":
      return r.path ? `read ${String(r.path)}` : "tried to read a file";
    case "write_files":
      return r.written ? `wrote ${String(r.count)} file(s)` : "tried to write files";
    case "delete_file": {
      const paths = Array.isArray(r.deletedPaths) ? (r.deletedPaths as string[]) : [];
      return r.deleted ? `deleted ${paths[0] ?? "a file"}` : "tried to delete a file";
    }
    case "remember":
      return r.saved ? "updated project notes" : "tried to update notes";
    default:
      return name;
  }
}

/**
 * Guardrail for models that PRINT a write_files payload into their reply
 * instead of calling the tool (common with weaker/local models). Finds
 * {"files":[{path,content}…]} blobs in the text, executes them for real,
 * and replaces the blob with a clean sentence. Returns the cleaned text.
 */
export async function salvageInlineFileWrites(
  text: string,
  ctx: ToolContext,
  changes: ChangeManifest,
): Promise<string> {
  let out = text;
  const re = /\{\s*"files"\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out))) {
    const start = m.index;
    // Brace-match the JSON object (string-aware).
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = start; i < out.length; i++) {
      const ch = out[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;

    const blob = out.slice(start, end + 1);
    let parsed: { files?: unknown };
    try {
      parsed = JSON.parse(blob) as { files?: unknown };
    } catch {
      continue;
    }
    const files = parsed.files;
    if (
      !Array.isArray(files) ||
      files.length === 0 ||
      !files.every(
        (f) =>
          f &&
          typeof f === "object" &&
          typeof (f as { path?: unknown }).path === "string" &&
          typeof (f as { content?: unknown }).content === "string",
      )
    ) {
      continue;
    }

    const result = await executeTool("write_files", { files }, ctx);
    if (!result || typeof result !== "object" || !(result as { written?: boolean }).written) continue;
    mergeChanges(changes, result);

    const paths = (files as Array<{ path: string }>).map((f) => f.path).join(", ");
    // Strip surrounding code fences along with the blob.
    let before = out.slice(0, start).replace(/```(?:json)?\s*$/i, "");
    const after = out.slice(end + 1).replace(/^\s*```/, "");
    if (!before.trim() && !after.trim()) before = "";
    out = `${before}Added ${paths} to the workspace.${after}`;
    re.lastIndex = 0;
  }
  return out;
}

/** Merge a tool result's written/deleted paths into the turn's change manifest. */
export interface ChangeManifest {
  written: string[];
  deleted: string[];
}

export function mergeChanges(manifest: ChangeManifest, result: unknown): ChangeManifest {
  if (!result || typeof result !== "object") return manifest;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.writtenPaths)) {
    for (const p of r.writtenPaths) {
      if (typeof p === "string" && !manifest.written.includes(p)) manifest.written.push(p);
    }
  }
  if (Array.isArray(r.deletedPaths)) {
    for (const p of r.deletedPaths) {
      if (typeof p === "string" && !manifest.deleted.includes(p)) {
        manifest.deleted.push(p);
        manifest.written = manifest.written.filter((w) => w !== p);
      }
    }
  }
  return manifest;
}
