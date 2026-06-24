import type { Metadata } from "next";
import { LongVideoComposer } from "@/components/video-editor/LongVideoComposer";

export const metadata: Metadata = {
  title: "HelixVideo Editor — Helix Studio",
  description: "Turn one idea into a multi-minute video — AI shot list, generated and stitched.",
};

export default function VideoEditorPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">HelixVideo Editor</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          One idea → an AI shot list → a clip per shot → stitched into one continuous, multi-minute reel.
        </p>
      </header>
      <LongVideoComposer />
    </div>
  );
}
