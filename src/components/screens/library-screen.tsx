"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Brain, Boxes, GitBranch, LineChart, Globe, Joystick, Library, ArrowLeft, Eye, Loader2, Plus, GraduationCap } from "lucide-react";
import type { LessonManifest } from "@/lib/lessons/types";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

/* The public lesson library — teachers browse lessons other teachers shared,
 * preview them, and clone one into their own class to edit + assign. */

const ICONS: Record<string, typeof Sparkles> = { Sparkles, Brain, Boxes, GitBranch, LineChart, Globe, Joystick };

export function LibraryScreen({ lessons, classes }: { lessons: LessonManifest[]; classes: { id: string; name: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function cloneToClass(lessonId: string) {
    const spaceId = picked[lessonId] || classes[0]?.id;
    if (!spaceId || busy) return;
    setBusy(lessonId);
    try {
      const res = await fetch("/api/lab/lessons/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, spaceId }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        toast("Copied into your class — edit it now");
        router.push(`/space/${spaceId}/instructor/lessons/${json.data.id}`);
      } else {
        toast(json?.error?.message ?? "Couldn't copy the lesson");
      }
    } catch {
      toast("Couldn't copy the lesson");
    }
    setBusy(null);
  }

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[1000px]">
        <Link href="/academy" className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-txt3 transition-colors hover:text-txt">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to AI Academy
        </Link>
        <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Teachers</div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">Lesson library</h1>
          <Library className="h-5 w-5 text-txt3" strokeWidth={1.7} />
        </div>
        <p className="mt-1 max-w-[620px] text-[13px] text-txt2">
          Lessons shared by other teachers. Preview one, then <span className="text-txt">use it in your class</span> —
          you get an editable copy to tweak and assign.
        </p>

        {classes.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-txt3">Create a classroom first to use library lessons.</Card>
        ) : lessons.length === 0 ? (
          <Card className="mt-6 p-8 text-center text-sm text-txt3">No public lessons yet — be the first to share one!</Card>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lessons.map((l) => {
              const Icon = ICONS[l.icon] ?? Sparkles;
              return (
                <li key={l.id}>
                  <Card className="flex h-full flex-col p-5">
                    <div className="mb-3 flex items-center gap-2.5">
                      <span className="grid h-10 w-10 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl">
                        <Icon className="h-5 w-5 text-accent" strokeWidth={1.8} />
                      </span>
                      {l.author && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-txt3">
                          <GraduationCap className="h-3 w-3" /> by {l.author}
                        </span>
                      )}
                    </div>
                    <div className="text-[15px] font-semibold text-txt">{l.title}</div>
                    <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-txt2">{l.blurb}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={`/academy/${l.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                      >
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </Link>
                      {classes.length > 1 && (
                        <select
                          value={picked[l.id] ?? classes[0].id}
                          onChange={(e) => setPicked((p) => ({ ...p, [l.id]: e.target.value }))}
                          className="h-7 rounded-md border border-border2 bg-panel2 px-1.5 text-[11px] text-txt2 outline-none focus:border-accent"
                        >
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => void cloneToClass(l.id)}
                        disabled={busy === l.id}
                        className="ml-auto inline-flex items-center gap-1 rounded-md border-none bg-accent px-2.5 py-1.5 text-[11.5px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
                      >
                        {busy === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Use in my class
                      </button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
