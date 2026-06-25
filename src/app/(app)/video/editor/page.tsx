import type { Metadata } from "next";
import { LongVideoComposer } from "@/components/video-editor/LongVideoComposer";

export const metadata: Metadata = {
  title: "HelixVideo Editor — Helix Studio",
  description: "Turn one idea into a multi-minute video — AI shot list, generated and stitched.",
};

export default async function VideoEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <div className="text-eyebrow mb-1">HelixVideo</div>
        <h1 className="text-h1">Video Editor</h1>
        <p className="mt-1 text-sm text-txt2">
          One idea → an AI shot list → a clip per shot → stitched into one continuous, multi-minute reel.
        </p>
      </header>
      <LongVideoComposer projectId={project ?? null} />
    </div>
  );
}
