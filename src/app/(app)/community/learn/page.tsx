import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { VIDEO_TEMPLATES } from "@/lib/video-templates";
import { TemplateCard } from "@/components/community/template-card";

export const metadata: Metadata = {
  title: "Learn: Make AI Videos — Helix Community",
  description:
    "New to AI video? Read the guide, then open a starter template and remix it into your own reel.",
};

export default function CommunityLearnPage() {
  return (
    <div className="pad-screen mx-auto max-w-[980px]">
      <Link
        href="/community"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-txt3 transition-colors hover:text-txt"
      >
        <ArrowLeft className="h-4 w-4" /> Community
      </Link>

      <div className="text-eyebrow mb-1">Learn</div>
      <h1 className="text-h1">Make AI videos</h1>
      <p className="mt-1.5 max-w-[620px] text-[15px] leading-relaxed text-txt2">
        New to AI video? Start with the guide, then open a starter template — it loads a ready-made
        reel into the editor so you can read the shot prompts, tweak the idea, and generate your own.
      </p>

      {/* Guide CTA */}
      <Link
        href="/video/guide"
        className="gradient-border hover-lift group mt-6 flex items-center gap-3.5 rounded-card-lg border border-[color-mix(in_srgb,var(--accent)_22%,var(--border-2))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--panel))] px-5 py-4"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-hl text-accent glow-accent">
          <BookOpen className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-h3 text-txt">How to make an AI video</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-txt2">
            The complete beginner walkthrough — idea to a finished, shareable reel.
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
      </Link>

      {/* Templates */}
      <h2 className="text-h2 mb-2 mt-8">Starter templates</h2>
      <p className="mb-4 max-w-[620px] text-[13.5px] leading-relaxed text-txt2">
        Each one is a working example with carefully written shot prompts — notice how every shot
        repeats the same style words to keep the reel cohesive. Open one, then make it yours.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VIDEO_TEMPLATES.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
      </div>
    </div>
  );
}
