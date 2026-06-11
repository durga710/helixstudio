"use client";

import { useState } from "react";
import { ChevronRight, File, Folder, FoldVertical, Plus } from "lucide-react";
import type { FileNode } from "@/lib/types";
import { useShell } from "@/components/shell/shell-context";
import { cn } from "@/lib/utils";

interface ExplorerProps {
  tree: FileNode[];
  activePath: string | null;
  onOpen: (path: string) => void;
}

export function Explorer({ tree, activePath, onOpen }: ExplorerProps) {
  const [closed, setClosed] = useState<Set<string>>(new Set(["prisma"]));
  const { setNewProjectOpen } = useShell();

  function toggle(path: string) {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function collapseAll() {
    const folders: string[] = [];
    (function walk(nodes: FileNode[]) {
      for (const n of nodes) {
        if (n.type === "folder") {
          folders.push(n.path);
          walk(n.children);
        }
      }
    })(tree);
    setClosed(new Set(folders));
  }

  function renderNode(node: FileNode, depth: number): React.ReactNode {
    const pad = { paddingLeft: `${6 + depth * 12}px` };
    if (node.type === "folder") {
      const isClosed = closed.has(node.path);
      return (
        <div key={node.path}>
          <button
            style={pad}
            onClick={() => toggle(node.path)}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-[7px] py-1 text-left text-[12.5px] text-txt2 hover:bg-panel2 hover:text-txt"
            aria-expanded={!isClosed}
          >
            <ChevronRight
              className={cn("h-[13px] w-[13px] shrink-0 text-txt3 transition-transform", !isClosed && "rotate-90")}
              strokeWidth={2}
            />
            <Folder className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
            <span>{node.name}</span>
          </button>
          {!isClosed && node.children.map((c) => renderNode(c, depth + 1))}
        </div>
      );
    }
    return (
      <button
        key={node.path}
        style={pad}
        onClick={() => onOpen(node.path)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 rounded-md border-none px-[7px] py-1 text-left text-[12.5px]",
          activePath === node.path
            ? "bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-txt"
            : "bg-transparent text-txt2 hover:bg-panel2 hover:text-txt"
        )}
      >
        <span className="w-[13px] shrink-0" />
        <File className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
        <span className="truncate">{node.name}</span>
        {node.change && (
          <span
            className={cn(
              "ml-auto font-mono text-[10px] font-bold",
              node.change === "M" ? "text-warn" : "text-ok"
            )}
          >
            {node.change}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-bg2">
      <div className="flex items-center justify-between border-b border-border px-[13px] py-2.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-txt3">
        <span>Explorer</span>
        <div className="flex gap-0.5">
          <button
            title="Collapse folders"
            onClick={collapseAll}
            className="grid h-[22px] w-[22px] cursor-pointer place-items-center rounded-[5px] border-none bg-transparent text-txt3 hover:bg-panel2 hover:text-txt"
          >
            <FoldVertical className="h-[13px] w-[13px]" strokeWidth={1.7} />
          </button>
          <button
            title="New file"
            onClick={() => setNewProjectOpen(true)}
            className="grid h-[22px] w-[22px] cursor-pointer place-items-center rounded-[5px] border-none bg-transparent text-txt3 hover:bg-panel2 hover:text-txt"
          >
            <Plus className="h-[13px] w-[13px]" strokeWidth={1.7} />
          </button>
        </div>
      </div>
      <div className="scroll-area flex-1 overflow-auto p-1.5">{tree.map((n) => renderNode(n, 0))}</div>
    </aside>
  );
}
