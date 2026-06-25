import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
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
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-eyebrow mb-1">HelixVideo</div>
          <h1 className="text-h1">Video Editor</h1>
          <p className="mt-1 text-sm text-txt2">
            One idea → an AI shot list → a clip per shot → stitched into one continuous, multi-minute reel.
          </p>
        </div>
        <Link
          href="/video/guide"
          className="hover-lift inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border2 bg-panel px-3 py-1.5 text-[13px] text-txt2 hover:text-txt"
        >
          <BookOpen className="h-4 w-4 text-accent" /> New here? Read the guide
        </Link>
      </header>
      <LongVideoComposer projectId={project ?? null} />
    </div>
  );
}
