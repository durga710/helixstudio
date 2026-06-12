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
import { validateFiles, MAX_TOOL_FILES, MAX_FILE_CHARS } from "@/lib/repo-files";
import { execInSandbox } from "@/lib/runner/vercel-sandbox";
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
    case "run_command":
      return `running \`${typeof args.command === "string" ? args.command.slice(0, 60) : "a command"}\`…`;
    case "search_files":
      return `searching for /${typeof args.pattern === "string" ? args.pattern.slice(0, 40) : "?"}/…`;
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
  /** Streaming hook — live activity labels for the client event stream. */
  onActivity?: (label: string) => void;
  /** "plan" turns are read-only: mutating tools are filtered out of the tool
   * list AND hard-blocked in executeTool (lax local models may ignore the
   * declared list). Default "build". */
  mode?: "plan" | "build";
  /**
   * Intent-ledger hook: lazily creates this turn's intent on the first
   * mutating tool call and returns its id. Null = creation failed (capture
   * is skipped, never the write). Undefined = capture disabled (plan turns,
   * callers that predate the ledger).
   */
  getIntentId?: () => Promise<string | null>;
}

const READ_CAP = 24_000;
const SEARCH_FILE_CAP = 40; // files scanned per search
const SEARCH_MATCH_CAP = 30; // matches returned per search
const SEARCH_BATCH = 5; // concurrent file reads while scanning

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
  {
    type: "function" as const,
    name: "run_command",
    description:
      "Run a shell command in the workspace's cloud VM (Linux, node24/python preinstalled) and get exit code + output. " +
      "USE THIS to verify your work: install deps, run tests/builds, reproduce errors — then fix what fails and run again. " +
      "The VM persists for ~15 minutes, so installs carry over between calls.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "shell command, executed via `sh -c` in the workspace root (max 500 chars)",
          minLength: 1,
          maxLength: 500,
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function" as const,
    name: "search_files",
    description:
      "Search the workspace's file CONTENTS with a regex (and optional path substring filter). " +
      "Returns path:line: snippet matches. Use this to find definitions/usages before reading whole files.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "regular expression matched against each line (max 200 chars)",
          minLength: 1,
          maxLength: 200,
        },
        pathFilter: {
          type: "string",
          description: "only search files whose path contains this substring",
          maxLength: 100,
        },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
    strict: false,
  },
];

const READ_ONLY_TOOL_NAMES = new Set(["list_files", "read_file", "search_files"]);
const MUTATING_TOOL_NAMES = new Set(["write_files", "delete_file", "remember", "run_command"]);

/** The tool list for a turn. Plan mode keeps only read-only tools (plus the
 * web_search built-in, which has no name field — don't filter it by name). */
export function workspaceTools(mode: "plan" | "build" = "build") {
  if (mode !== "plan") return WORKSPACE_TOOLS;
  return WORKSPACE_TOOLS.filter(
    (t) => t.type === "web_search" || READ_ONLY_TOOL_NAMES.has((t as { name?: string }).name ?? ""),
  );
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const label = progressLabel(name, args);
  setProgress(ctx.workspaceId, label);
  ctx.onActivity?.(label);
  try {
    return await executeToolInner(name, args, ctx);
  } finally {
    // Back to the model deliberating until the next tool call.
    setProgress(ctx.workspaceId, "thinking…");
    ctx.onActivity?.("thinking…");
  }
}

async function executeToolInner(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const ws = await getWorkspaceForUser(ctx.workspaceId, ctx.userId);
  if (!ws) return { error: "workspace not found" };

  if (ctx.mode === "plan" && MUTATING_TOOL_NAMES.has(name)) {
    return { error: "Plan mode is read-only — finish the plan; the user approves before anything is built." };
  }

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
      const intentId = ctx.getIntentId ? await ctx.getIntentId() : null;
      const result = await writeWorkspaceFiles(ws, files, intentId ? { intentId } : undefined);
      if ("error" in result) return result;
      if (ctx.cache) ctx.cache.tree = undefined; // listing changed
      return { written: true, count: files.length, writtenPaths: result.writtenPaths };
    }
    case "delete_file": {
      const path = s(args.path);
      if (!path) return { error: "path is required" };
      const intentId = ctx.getIntentId ? await ctx.getIntentId() : null;
      const result = await deleteWorkspaceFile(ws, path, intentId ? { intentId } : undefined);
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
    case "run_command": {
      const command = s(args.command).trim();
      if (!command) return { error: "command is required" };
      if (command.length > 500) return { error: "command too long — max 500 characters" };
      // Commands run against a disposable copy of the workspace in the VM —
      // they never change workspace files, so the tree cache stays valid.
      const result = await execInSandbox(ws, command);
      if ("error" in result) return result;
      return { command, ...result };
    }
    case "search_files": {
      const pattern = s(args.pattern);
      if (!pattern) return { error: "pattern is required" };
      if (pattern.length > 200) return { error: "pattern too long — max 200 characters" };
      let re: RegExp;
      try {
        re = new RegExp(pattern);
      } catch (e) {
        return { error: `invalid regex: ${e instanceof Error ? e.message : "bad pattern"}` };
      }
      const pathFilter = s(args.pathFilter);

      const tree = ctx.cache?.tree ?? (await listWorkspaceFiles(ws));
      if (ctx.cache) ctx.cache.tree = tree;
      const eligible = tree.filter(
        (f) => (!pathFilter || f.path.includes(pathFilter)) && f.size <= MAX_FILE_CHARS,
      );
      // Shallow/short paths first — they're usually the interesting ones.
      const candidates = eligible
        .slice()
        .sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))
        .slice(0, SEARCH_FILE_CAP);

      const matches: string[] = [];
      let scannedFiles = 0;
      let capped = false;
      outer: for (let i = 0; i < candidates.length; i += SEARCH_BATCH) {
        const batch = candidates.slice(i, i + SEARCH_BATCH);
        const reads = await Promise.all(batch.map((f) => readWorkspaceFile(ws, f.path)));
        for (let j = 0; j < batch.length; j++) {
          const content = reads[j];
          if (content === null) continue; // binary/unreadable — skip
          scannedFiles++;
          const lines = content.split(/\r?\n/);
          for (let n = 0; n < lines.length; n++) {
            if (!re.test(lines[n])) continue;
            matches.push(`${batch[j].path}:${n + 1}: ${lines[n].trim().slice(0, 160)}`);
            if (matches.length >= SEARCH_MATCH_CAP) {
              capped = true;
              break outer;
            }
          }
        }
      }
      return {
        pattern,
        matches,
        scannedFiles,
        truncated: capped || eligible.length > candidates.length,
      };
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
    case "run_command":
      return typeof r.exitCode === "number"
        ? `ran \`${s(r.command).slice(0, 40)}\` (exit ${String(r.exitCode)})`
        : "tried to run a command";
    case "search_files":
      return Array.isArray(r.matches)
        ? `searched /${s(r.pattern).slice(0, 30)}/ (${r.matches.length} hit(s))`
        : "tried to search files";
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
