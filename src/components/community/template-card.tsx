"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Loader2, Wand2 } from "lucide-react";
import type { VideoTemplate } from "@/lib/video-templates";

/** A curated starter reel. "Use this template" creates a fresh VideoProject from
 *  it (via the normal save endpoint) and opens it in the editor. */
export function TemplateCard({ template }: { template: VideoTemplate }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const portrait = template.size.startsWith("720x");
  const total = template.shots.length * template.secondsEach;
  const totalLabel = total >= 60 ? `${Math.floor(total / 60)}m ${total % 60}s` : `${total}s`;

  async function use() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/video/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: template.title,
          idea: template.idea,
          size: template.size,
          secondsEach: template.secondsEach,
          shots: template.shots.map((s) => ({ title: s.title, prompt: s.prompt, seconds: s.seconds })),
        }),
      });
      const j = await r.json();
      if (r.ok && j?.data?.id) {
        router.push(`/video/editor?project=${j.data.id}`);
        return;
      }
    } catch {
      /* fall through — re-enable the button so they can retry */
    }
    setBusy(false);
  }

  return (
    <div className="lit hover-lift flex flex-col rounded-card border border-border bg-panel p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border2 bg-panel2 text-accent">
          <Clapperboard className="h-4 w-4" />
        </span>
        <h3 className="text-h3 min-w-0 flex-1 truncate text-txt">{template.title}</h3>
        <span className="shrink-0 rounded-full border border-border2 bg-panel2 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-txt3">
          {template.category}
        </span>
      </div>
      <p className="text-[12.5px] leading-relaxed text-txt2">{template.description}</p>
      <div className="mt-2 flex items-center gap-2 font-mono text-[10.5px] text-txt3">
        <span>{template.shots.length} shots</span>
        <span>·</span>
        <span>≈ {totalLabel}</span>
        <span>·</span>
        <span>{portrait ? "Portrait" : "Landscape"}</span>
      </div>
      <button
        type="button"
        onClick={use}
        disabled={busy}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-[13px] font-semibold text-accent-ink transition hover:-translate-y-px disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        Use this template
      </button>
    </div>
  );
}
