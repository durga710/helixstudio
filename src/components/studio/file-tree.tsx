"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen, Trash2 } from "lucide-react";
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

/** Flat path list → nested tree, folders first, alphabetical. */
function buildTree(files: TreeFile[]): TreeNode[] {
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
    nodes.sort((a, b) =>
      a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name),
    );
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
  importMode,
  onOpen,
  onDelete,
}: {
  files: TreeFile[];
  selected: string | null;
  dirtyPaths: Set<string>;
  importMode: boolean;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  // Folders the user explicitly collapsed (default = expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
      return (
        <li key={`f:${node.path}`} className="group/file relative">
          <button
            type="button"
            onClick={() => onOpen(node.path)}
            style={pad}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md py-1 pr-7 text-left font-mono text-[11px] transition-colors",
              selected === node.path
                ? "bg-hl text-accent"
                : "text-txt2 hover:bg-panel2 hover:text-txt",
              isDirty && "text-warn",
              node.file.source === "workspace" && importMode && "text-ok",
            )}
            title={node.path}
          >
            <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="truncate">
              {isDirty ? "● " : ""}
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

  return <ul className="space-y-0.5">{renderNodes(tree, 0)}</ul>;
}
