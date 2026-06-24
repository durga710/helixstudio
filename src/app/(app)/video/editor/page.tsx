import type { Metadata } from "next";
import { EditorStage } from "@/components/video-editor/EditorStage";

export const metadata: Metadata = {
  title: "HelixVideo Editor — Helix Studio",
  description: "Compose and preview cinematic AI video, scene by scene.",
};

export default function VideoEditorPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">HelixVideo Editor</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Live preview of a composed scene. Timeline editing and AI scene authoring land next.
        </p>
      </header>
      <EditorStage />
    </div>
  );
}
