"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/studio/chat-panel";
import { WorkspacePanel } from "@/components/studio/workspace-panel";

export interface WorkspaceMeta {
  id: string;
  name: string;
  mode: "SCRATCH" | "IMPORT";
  repo: string | null;
  baseBranch: string | null;
}

export interface Changes {
  written: string[];
  deleted: string[];
  nonce: number;
}

/**
 * The studio: chat on the left, live coding workspace on the right. The only
 * shared state is the change manifest from the last chat turn — the
 * workspace panel uses it to refresh its tree and any open files.
 *
 * Fills its container: the parent page provides the height (h-full/min-h-0),
 * so this works inside Helix's rail + topbar shell without viewport math.
 */
export function Studio({ workspace, isGuest }: { workspace: WorkspaceMeta; isGuest?: boolean }) {
  const [changes, setChanges] = useState<Changes | null>(null);

  return (
    <div className="grid h-auto min-h-0 grid-cols-1 gap-4 xl:h-full xl:grid-cols-5">
      <div className="h-[60vh] min-h-0 xl:col-span-2 xl:h-full">
        <ChatPanel
          workspace={workspace}
          isGuest={isGuest}
          onChanges={(written, deleted) =>
            setChanges((c) => ({ written, deleted, nonce: (c?.nonce ?? 0) + 1 }))
          }
        />
      </div>
      <div className="h-[70vh] min-h-0 xl:col-span-3 xl:h-full">
        <WorkspacePanel workspace={workspace} changes={changes} isGuest={isGuest} />
      </div>
    </div>
  );
}
