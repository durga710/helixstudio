/**
 * Validation for workspace files and GitHub pushes. Pure module (no server
 * deps): the AI builds apps by writing files into the virtual workspace and
 * the user pushes them to their repos — these are the guardrails.
 */

// Per AI tool call (write_files):
export const MAX_TOOL_FILES = 15;
// Per push to GitHub (the whole overlay ships in one commit):
export const MAX_PUSH_FILES = 60;
export const MAX_FILE_CHARS = 48_000;
export const MAX_TOTAL_CHARS = 512_000;
// Overlay rows per workspace:
export const MAX_WORKSPACE_FILES = 400;

export interface PushFile {
  path: string;
  content: string;
}

export function isValidRepoName(repo: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(repo);
}

export function isValidBranchName(branch: string): boolean {
  return (
    branch.length > 0 &&
    branch.length <= 80 &&
    /^[\w./-]+$/.test(branch) &&
    !branch.includes("..") &&
    !branch.startsWith("/") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".lock")
  );
}

/** Repo-relative file path: no traversal, no .git, no absolute paths. */
export function isSafeRepoPath(path: string): boolean {
  if (!path || path.length > 200) return false;
  if (!/^[\w./ -]+$/.test(path)) return false;
  const segments = path.split("/");
  if (segments.some((seg) => !seg || seg === "." || seg === "..")) return false;
  if (segments[0] === ".git") return false;
  return true;
}

export function validateFiles(
  files: PushFile[],
  maxFiles: number
): { ok: true } | { ok: false; error: string } {
  if (files.length === 0) return { ok: false, error: "no files" };
  if (files.length > maxFiles) {
    return { ok: false, error: `too many files — max ${maxFiles} per call` };
  }

  let total = 0;
  const seen = new Set<string>();
  for (const f of files) {
    if (!isSafeRepoPath(f.path)) return { ok: false, error: `unsafe file path: ${f.path || "(empty)"}` };
    if (seen.has(f.path)) return { ok: false, error: `duplicate file path: ${f.path}` };
    seen.add(f.path);
    if (!f.content) return { ok: false, error: `empty content for ${f.path}` };
    if (f.content.length > MAX_FILE_CHARS) {
      return { ok: false, error: `${f.path} is too large — max ${MAX_FILE_CHARS} characters per file` };
    }
    total += f.content.length;
  }
  if (total > MAX_TOTAL_CHARS) {
    return { ok: false, error: `too large — max ${MAX_TOTAL_CHARS} characters total` };
  }
  return { ok: true };
}
