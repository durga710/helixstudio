"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/studio/chat-panel";
import { WorkspacePanel } from "@/components/studio/workspace-panel";

export interface WorkspaceMeta {
  id: string;
  name: string;
  mode: "SCRATCH" | "IMPORT";
  repo: string | null;
  provider: string;
  baseBranch: string | null;
  spaceId?: string | null;
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
export function Studio({
  workspace,
  isGuest,
  isOwner = true,
  ownerName,
}: {
  workspace: WorkspaceMeta;
  isGuest?: boolean;
  /** False when a Space member is viewing a teammate's shared workspace. */
  isOwner?: boolean;
  ownerName?: string;
}) {
  const [changes, setChanges] = useState<Changes | null>(null);

  // xl:grid-rows-1 → grid-template-rows: minmax(0,1fr): the single row fills the
  // container height and can't grow past it. Without it the row is auto-sized,
  // so a tall file tree (big repo) expands the workspace column, drags the whole
  // row taller than the screen, and stretches the chat column thousands of px
  // tall — pushing its messages + input far below the fold so the panel looks
  // empty. Capping the row makes the file tree and chat scroll inside their own
  // fixed-height columns instead.
  return (
    <div className="grid h-auto min-h-0 grid-cols-1 gap-4 xl:h-full xl:grid-cols-5 xl:grid-rows-1">
      {/* min-w-0 on both: without it a grid item defaults to min-width:auto and
          won't shrink below its content's intrinsic width — the Monaco editor
          on the Code tab has a large min-width and would otherwise blow out its
          column and crush the chat to a sliver. */}
      <div className="h-[60vh] min-h-0 min-w-0 xl:col-span-2 xl:h-full">
        <ChatPanel
          workspace={workspace}
          isGuest={isGuest}
          isOwner={isOwner}
          onChanges={(written, deleted) =>
            setChanges((c) => ({ written, deleted, nonce: (c?.nonce ?? 0) + 1 }))
          }
        />
      </div>
      <div className="h-[70vh] min-h-0 min-w-0 xl:col-span-3 xl:h-full">
        <WorkspacePanel
          workspace={workspace}
          changes={changes}
          isGuest={isGuest}
          isOwner={isOwner}
          ownerName={ownerName}
        />
      </div>
    </div>
  );
}
