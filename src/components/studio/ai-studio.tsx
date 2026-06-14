"use client";

import { useState } from "react";
import type { StudioMeta } from "@/lib/lessons/studios";
import { AiGuidePanel } from "@/components/studio/ai-guide-panel";
import { AiCanvas, type LessonCard } from "@/components/studio/ai-canvas";

/**
 * The AI mode of the editor — a workspace-less twin of Studio. Left: an AI guide
 * that teaches and opens studios. Right: the studios/lessons canvas (gallery, or
 * the live workbench when one is open). The guide and canvas stay in sync — the
 * guide can open a studio, and the open studio's live state feeds the guide.
 */
export function AiStudio({ studios, lessons }: { studios: StudioMeta[]; lessons: LessonCard[] }) {
  const [openStudioId, setOpenStudioId] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<Record<string, unknown>>({});

  return (
    <div className="grid h-auto min-h-0 grid-cols-1 gap-4 xl:h-full xl:grid-cols-5 xl:grid-rows-1">
      <div className="h-[60vh] min-h-0 min-w-0 xl:col-span-2 xl:h-full">
        <AiGuidePanel openStudioId={openStudioId} liveState={liveState} onOpenStudio={setOpenStudioId} />
      </div>
      <div className="h-[70vh] min-h-0 min-w-0 rounded-card border border-border bg-panel p-4 xl:col-span-3 xl:h-full">
        <AiCanvas
          studios={studios}
          lessons={lessons}
          openStudioId={openStudioId}
          onOpenStudio={setOpenStudioId}
          onState={setLiveState}
        />
      </div>
    </div>
  );
}
