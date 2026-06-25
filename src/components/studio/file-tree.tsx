"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TreeFile {
  path: string;
  size: number;
  source: "workspace" | "repo";
}

interface DirNode {
  type: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}
interface FileNode {
  type: "file";
  name: string;
  path: string;
  file: TreeFile;
}
type TreeNode = DirNode | FileNode;

/** Flat path list → nested tree, folders first, then just-changed files, then
 * alphabetical (so the latest AI changes float to the top of their folder). */
function buildTree(files: TreeFile[], recent: Set<string>): TreeNode[] {
  const root: DirNode = { type: "dir", name: "", path: "", children: [] };
  const dirs = new Map<string, DirNode>([["", root]]);

  const dirFor = (path: string): DirNode => {
    const existing = dirs.get(path);
    if (existing) return existing;
    const idx = path.lastIndexOf("/");
    const parent = dirFor(idx === -1 ? "" : path.slice(0, idx));
    const node: DirNode = {
      type: "dir",
      name: idx === -1 ? path : path.slice(idx + 1),
      path,
      children: [],
    };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };

  for (const f of files) {
    const idx = f.path.lastIndexOf("/");
    const parent = dirFor(idx === -1 ? "" : f.path.slice(0, idx));
    parent.children.push({
      type: "file",
      name: idx === -1 ? f.path : f.path.slice(idx + 1),
      path: f.path,
      file: f,
    });
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      if (a.type === "file" && b.type === "file") {
        const ra = recent.has(a.path);
        const rb = recent.has(b.path);
        if (ra !== rb) return ra ? -1 : 1; // just-changed files first
      }
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.type === "dir") sortNodes(n.children);
  };
  sortNodes(root.children);
  return root.children;
}

/**
 * Collapsible file tree: click a folder to expand/collapse its contents.
 * Folders start expanded so nothing looks missing; state is per-folder.
 */
export function FileTree({
  files,
  selected,
  dirtyPaths,
  recentPaths,
  importMode,
  onOpen,
  onDelete,
}: {
  files: TreeFile[];
  selected: string | null;
  dirtyPaths: Set<string>;
  /** Files changed by the latest AI turn — floated to the top + highlighted. */
  recentPaths?: Set<string>;
  importMode: boolean;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const recent = useMemo(() => recentPaths ?? new Set<string>(), [recentPaths]);
  const tree = useMemo(() => buildTree(files, recent), [files, recent]);
  // Folders the user explicitly collapsed (default = expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // While searching, show a flat list of matching files (fastest way to jump to
  // a file by name) instead of the nested tree.
  const matches = useMemo(
    () => (q ? files.filter((f) => f.path.toLowerCase().includes(q)).sort((a, b) => a.path.localeCompare(b.path)) : []),
    [files, q],
  );

  const toggle = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const pad = { paddingLeft: `${8 + depth * 14}px` };
      if (node.type === "dir") {
        const isCollapsed = collapsed.has(node.path);
        return (
          <li key={`d:${node.path}`}>
            <button
              type="button"
              onClick={() => toggle(node.path)}
              style={pad}
              className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left font-mono text-[11px]
                         text-txt2 transition-colors hover:bg-panel2 hover:text-txt"
              title={node.path}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3 shrink-0 text-txt3" />
              ) : (
                <ChevronDown className="h-3 w-3 shrink-0 text-txt3" />
              )}
              {isCollapsed ? (
                <Folder className="h-3.5 w-3.5 shrink-0 text-accent/70" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent/70" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
            {!isCollapsed && <ul>{renderNodes(node.children, depth + 1)}</ul>}
          </li>
        );
      }
      const isDirty = dirtyPaths.has(node.path);
      const isRecent = recent.has(node.path);
      return (
        <li key={`f:${node.path}`} className="tree-row group/file relative">
          <button
            type="button"
            onClick={() => onOpen(node.path)}
            style={pad}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md py-1 pr-7 text-left font-mono text-[11px] transition-colors",
              selected === node.path
                ? "bg-hl text-accent"
                : isRecent
                  ? "bg-ok/10 text-ok"
                  : "text-txt2 hover:bg-panel2 hover:text-txt",
              isDirty && "text-warn",
              node.file.source === "workspace" && importMode && !isRecent && "text-ok",
            )}
            title={node.path}
          >
            <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="truncate">
              {isDirty ? "● " : isRecent ? "● " : ""}
              {node.name}
            </span>
          </button>
          <button
            type="button"
            aria-label={`Delete ${node.path}`}
            onClick={() => onDelete(node.path)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-txt3 opacity-0 transition-all hover:text-bad group-hover/file:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </li>
      );
    });

  return (
    <div>
      {/* Search — type to filter files by name/path; clears back to the tree. */}
      <div className="relative mb-1.5 px-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-txt3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files…"
          aria-label="Search files"
          className="w-full rounded-md border border-border bg-bg2 py-1 pl-7 pr-6 font-mono text-[11px] text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-txt3 transition-colors hover:text-txt"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {q ? (
        matches.length === 0 ? (
          <p className="px-3 py-2 font-mono text-[11px] text-txt3">No files match “{query}”.</p>
        ) : (
          <ul className="space-y-0.5">
            {matches.map((f) => {
              const name = f.path.slice(f.path.lastIndexOf("/") + 1);
              const dir = f.path.slice(0, f.path.lastIndexOf("/"));
              const isDirty = dirtyPaths.has(f.path);
              const isRecent = recent.has(f.path);
              return (
                <li key={`m:${f.path}`} className="tree-row group/file relative">
                  <button
                    type="button"
                    onClick={() => onOpen(f.path)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md py-1 pl-2 pr-7 text-left font-mono text-[11px] transition-colors",
                      selected === f.path
                        ? "bg-hl text-accent"
                        : isRecent
                          ? "bg-ok/10 text-ok"
                          : "text-txt2 hover:bg-panel2 hover:text-txt",
                      isDirty && "text-warn",
                    )}
                    title={f.path}
                  >
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">
                      {isDirty ? "● " : ""}
                      {name}
                      {dir && <span className="text-txt3"> · {dir}</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${f.path}`}
                    onClick={() => onDelete(f.path)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-txt3 opacity-0 transition-all hover:text-bad group-hover/file:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <ul className="space-y-0.5">{renderNodes(tree, 0)}</ul>
      )}
    </div>
  );
}
