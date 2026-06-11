import { gunzipSync } from "node:zlib";
import type { FileNode, SourceFile } from "@/lib/types";

/* Real GitHub repository import (Phase 2).
 *
 * Fetches the default-branch tarball from codeload.github.com (no API token
 * needed for public repos), unpacks it in memory with a minimal tar reader,
 * and returns the text files as an editor-ready tree. Size caps keep imports
 * serverless-friendly. */

const MAX_TARBALL_BYTES = 25 * 1024 * 1024;
const MAX_FILE_BYTES = 150 * 1024;
const MAX_FILES = 400;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", "vendor",
  ".turbo", ".cache", "target", "__pycache__", ".venv", "venv",
]);

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", swift: "Swift",
  c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", cs: "C#", php: "PHP", pl: "Perl",
  md: "Markdown", mdx: "Markdown", json: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML",
  css: "CSS", scss: "SCSS", html: "HTML", svg: "SVG", sql: "SQL", prisma: "Prisma",
  sh: "Shell", bash: "Shell", env: "Env", txt: "Text", xml: "XML", graphql: "GraphQL",
  vue: "Vue", svelte: "Svelte", tf: "Terraform", proto: "Protobuf", lock: "Lockfile",
};

export function languageFor(path: string): string {
  const name = path.split("/").pop() ?? path;
  if (name === "Dockerfile") return "Dockerfile";
  if (name === "Makefile") return "Makefile";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return LANGUAGES[ext] ?? "";
}

function isProbablyText(buf: Buffer): boolean {
  const probe = buf.subarray(0, Math.min(buf.length, 1024));
  return !probe.includes(0);
}

interface TarEntry {
  name: string;
  data: Buffer;
}

/** Minimal ustar/GNU tar reader — regular files only. */
function* readTar(tar: Buffer): Generator<TarEntry> {
  let offset = 0;
  let pendingLongName: string | null = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;

    const sizeOctal = header.subarray(124, 136).toString("ascii").replace(/[^0-7]/g, "");
    const size = sizeOctal ? parseInt(sizeOctal, 8) : 0;
    const typeflag = String.fromCharCode(header[156]!);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    offset = dataStart + Math.ceil(size / 512) * 512;
    if (dataEnd > tar.length) break;

    if (typeflag === "L") {
      // GNU long-name entry: payload is the next entry's path.
      pendingLongName = tar.subarray(dataStart, dataEnd).toString("utf8").replace(/\0+$/, "");
      continue;
    }
    if (typeflag !== "0" && typeflag !== "\0") {
      pendingLongName = null;
      continue; // directories, symlinks, pax headers
    }

    let name = pendingLongName;
    pendingLongName = null;
    if (!name) {
      const base = header.subarray(0, 100).toString("utf8").replace(/\0+$/, "");
      const prefix = header.subarray(345, 500).toString("utf8").replace(/\0+$/, "");
      name = prefix ? `${prefix}/${base}` : base;
    }
    yield { name, data: tar.subarray(dataStart, dataEnd) };
  }
}

export interface ImportedRepo {
  files: SourceFile[];
  tree: FileNode[];
  totalEntries: number;
  branch: string;
}

export class RepoImportError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
  }
}

export async function importGitHubRepo(owner: string, repo: string): Promise<ImportedRepo> {
  let res: Response;
  try {
    res = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/HEAD`, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "helix-studio" },
    });
  } catch {
    throw new RepoImportError("Couldn't reach GitHub — check the URL and try again", 502);
  }
  if (res.status === 404) throw new RepoImportError("Repository not found (private repos need a token — coming soon)");
  if (!res.ok) throw new RepoImportError(`GitHub returned ${res.status} for that repository`);

  const gz = Buffer.from(await res.arrayBuffer());
  if (gz.length > MAX_TARBALL_BYTES) {
    throw new RepoImportError("Repository is too large for in-browser indexing (25 MB tarball cap)");
  }

  const tar = gunzipSync(gz);
  const files: SourceFile[] = [];
  let totalEntries = 0;
  let totalBytes = 0;

  for (const entry of readTar(tar)) {
    // Strip the "<repo>-<ref>/" wrapper directory.
    const path = entry.name.split("/").slice(1).join("/");
    if (!path) continue;
    totalEntries += 1;
    const segments = path.split("/");
    if (segments.some((s) => SKIP_DIRS.has(s) || s.startsWith("."))) {
      // allow a few important dotfiles at root
      const name = segments[segments.length - 1]!;
      if (!(segments.length === 1 && [".gitignore", ".env.example"].includes(name))) continue;
    }
    if (entry.data.length > MAX_FILE_BYTES || !isProbablyText(entry.data)) continue;
    if (files.length >= MAX_FILES || totalBytes + entry.data.length > MAX_TOTAL_BYTES) continue;

    totalBytes += entry.data.length;
    files.push({ path, language: languageFor(path), content: entry.data.toString("utf8") });
  }

  if (files.length === 0) throw new RepoImportError("No indexable text files found in that repository");

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, tree: buildTree(files), totalEntries, branch: "HEAD" };
}

export function buildTree(files: SourceFile[]): FileNode[] {
  interface DirNode {
    dirs: Map<string, DirNode>;
    files: string[];
    path: string;
  }
  const root: DirNode = { dirs: new Map(), files: [], path: "" };

  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      if (!node.dirs.has(parts[i]!)) {
        node.dirs.set(parts[i]!, { dirs: new Map(), files: [], path: dirPath });
      }
      node = node.dirs.get(parts[i]!)!;
    }
    node.files.push(file.path);
  }

  function toNodes(dir: DirNode): FileNode[] {
    const folders: FileNode[] = [...dir.dirs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) => ({ type: "folder", name, path: child.path, children: toNodes(child) }));
    const leaves: FileNode[] = dir.files.sort().map((path) => ({
      type: "file",
      name: path.split("/").pop()!,
      path,
    }));
    return [...folders, ...leaves];
  }

  return toNodes(root);
}
