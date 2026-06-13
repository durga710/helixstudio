import "server-only";
import { db } from "@/lib/db";
import type { SourceFile } from "@/lib/types";

const MAX_FILES = 40;
const MAX_FILE_CHARS = 2_400;
const MAX_CONTEXT_CHARS = 9_000;

function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
    py: "Python", go: "Go", rs: "Rust", java: "Java", rb: "Ruby",
    md: "Markdown", json: "JSON", yaml: "YAML", yml: "YAML",
    css: "CSS", html: "HTML", sql: "SQL",
  };
  return map[ext] ?? "Text";
}

/** Load workspace files from the overlay (DB), up to MAX_FILES. */
export async function loadWorkspaceSources(workspaceId: string): Promise<SourceFile[]> {
  const rows = await db().workspaceFile.findMany({
    where: { workspaceId, deleted: false },
    select: { path: true, content: true },
    take: MAX_FILES,
    orderBy: { path: "asc" },
  });
  return rows.map((f) => ({
    path: f.path,
    language: langFromPath(f.path),
    content: f.content,
  }));
}

/** Build a compact, token-bounded context string for LLM agent steps. */
export async function buildWorkspaceContext(workspaceId: string, wsName: string): Promise<string> {
  const files = await loadWorkspaceSources(workspaceId);
  if (files.length === 0) {
    return `## Workspace: ${wsName}\n(No files indexed yet — open the editor and create or import files first.)`;
  }

  const parts: string[] = [
    `## Workspace: ${wsName}`,
    `Files: ${files.length}`,
    "## File map",
    files.map((f) => f.path).join("\n"),
  ];

  // Include content for key files first, then a few source files.
  const priority = [
    files.find((f) => f.path === "package.json"),
    files.find((f) => /^readme\./i.test(f.path.split("/").pop() ?? "")),
  ].filter(Boolean) as SourceFile[];

  const source = files.filter(
    (f) => [".ts", ".tsx", ".js", ".jsx", ".py", ".go"].some((ext) => f.path.endsWith(ext))
  ).slice(0, 5);

  for (const file of [...priority, ...source]) {
    const body = file.content.length > MAX_FILE_CHARS
      ? `${file.content.slice(0, MAX_FILE_CHARS)}\n… (truncated)`
      : file.content;
    parts.push(`## ${file.path}`, "```" + file.language.toLowerCase(), body, "```");
  }

  let out = parts.join("\n");
  if (out.length > MAX_CONTEXT_CHARS) out = `${out.slice(0, MAX_CONTEXT_CHARS)}\n… (context truncated)`;
  return out;
}
