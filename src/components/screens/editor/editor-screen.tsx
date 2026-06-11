"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { FileNode, SourceFile } from "@/lib/types";
import { Explorer } from "./explorer";
import { CodeView, EditorStatusBar } from "./code-view";
import { ChatPanel } from "./chat-panel";
import { DevPanel } from "./dev-panel";
import { cn } from "@/lib/utils";

interface EditorScreenProps {
  tree: FileNode[];
  files: SourceFile[];
  /** The seeded acme-web demo workspace gets its scripted tabs + diff badges. */
  seeded: boolean;
}

const SEED_TABS = ["app/api/orders.ts", "app/api/invites.ts", "app/components/InviteCard.tsx"];

function initialTabs(seeded: boolean, files: SourceFile[]): string[] {
  if (seeded) return SEED_TABS;
  const readme = files.find((f) => /^readme\./i.test(f.path));
  const first = readme ?? files[0];
  return first ? [first.path] : [];
}

export function EditorScreen({ tree, files: initialFiles, seeded }: EditorScreenProps) {
  const DIRTY_PATHS = seeded ? new Set(["app/api/orders.ts"]) : new Set<string>();
  const [files, setFiles] = useState(initialFiles);
  const [openTabs, setOpenTabs] = useState<string[]>(() => initialTabs(seeded, initialFiles));
  const [activePath, setActivePath] = useState<string | null>(
    () => (seeded ? "app/api/invites.ts" : initialTabs(seeded, initialFiles)[0] ?? null)
  );

  const activeFile = files.find((f) => f.path === activePath) ?? null;

  function open(path: string) {
    setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
    setActivePath(path);
  }

  function close(path: string) {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t !== path);
      if (activePath === path) setActivePath(next[next.length - 1] ?? null);
      return next;
    });
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[236px_1fr] xl:grid-cols-[236px_1fr_372px]">
      <Explorer tree={tree} activePath={activePath} onOpen={open} />

      <div className="flex min-w-0 flex-col bg-codebg">
        <div className="scroll-area flex shrink-0 overflow-x-auto border-b border-border bg-bg2" role="tablist">
          {openTabs.map((path) => {
            const name = path.split("/").pop()!;
            const active = path === activePath;
            return (
              <div
                key={path}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                onClick={() => setActivePath(path)}
                onKeyDown={(e) => e.key === "Enter" && setActivePath(path)}
                className={cn(
                  "relative flex cursor-pointer items-center gap-[7px] whitespace-nowrap border-r border-border px-[13px] py-2 text-[12.5px]",
                  active
                    ? "bg-codebg text-txt after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-accent"
                    : "text-txt2 hover:text-txt"
                )}
              >
                <span className="inline-block h-[7px] w-[7px] rounded-sm bg-[#3178c6]" />
                {name}
                {DIRTY_PATHS.has(path) ? (
                  <span className="h-[7px] w-[7px] rounded-full bg-warn" title="Unsaved changes" />
                ) : (
                  <button
                    aria-label={`Close ${name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      close(path);
                    }}
                    className="ml-0.5 cursor-pointer border-none bg-transparent text-txt3 hover:text-txt"
                  >
                    <X className="h-3 w-3" strokeWidth={2} />
                  </button>
                )}
              </div>
            );
          })}
          {openTabs.length === 0 && (
            <div className="px-[13px] py-2 text-[12.5px] text-txt3">No files open</div>
          )}
        </div>
        <CodeView
          file={activeFile}
          onSaved={(path, content) =>
            setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)))
          }
        />
        <DevPanel />
        <EditorStatusBar file={activeFile} />
      </div>

      <div className="hidden min-h-0 xl:flex xl:flex-col">
        <ChatPanel />
      </div>
    </div>
  );
}
