"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Loader2, Plus, Pencil, Trash2, Eye, EyeOff, Library, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/* The teacher's lesson builder: describe a lesson, AI drafts it, then edit and
 * publish it to the class. Lives in the Instructor Dashboard. */

interface LessonRow {
  id: string;
  title: string;
  status: string;
  source: string;
  updatedAt: string;
}

export function LessonBuilderPanel({ spaceId }: { spaceId: string }) {
  const { toast } = useToast();
  const [lessons, setLessons] = useState<LessonRow[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/lab/lessons?spaceId=${encodeURIComponent(spaceId)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setLessons(json.data.lessons as LessonRow[]);
      else setLessons([]);
    } catch {
      setLessons([]);
    }
  }, [spaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state set post-await
    void load();
  }, [load]);

  const editHref = (id: string) => `/space/${spaceId}/instructor/lessons/${id}`;

  async function generate() {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/lab/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, prompt: p }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setPrompt("");
        await load();
        toast("Lesson drafted — edit and publish it");
        window.location.href = editHref(json.data.id);
      } else {
        setNote(json?.error?.message ?? "Couldn't generate the lesson.");
      }
    } catch {
      setNote("Couldn't generate the lesson — try again.");
    }
    setBusy(false);
  }

  async function createBlank() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/lab/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) window.location.href = editHref(json.data.id);
      else toast("Couldn't create a lesson");
    } catch {
      toast("Couldn't create a lesson");
    }
    setBusy(false);
  }

  async function togglePublish(l: LessonRow) {
    const publish = l.status !== "published";
    try {
      const res = await fetch(`/api/lab/lessons/${l.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish }),
      });
      if (res.ok) {
        setLessons((prev) => prev?.map((x) => (x.id === l.id ? { ...x, status: publish ? "published" : "draft" } : x)) ?? null);
        toast(publish ? "Published to your class" : "Unpublished");
      } else {
        const json = await res.json().catch(() => null);
        toast(json?.error?.message ?? "Couldn't update");
      }
    } catch {
      toast("Couldn't update");
    }
  }

  async function remove(l: LessonRow) {
    if (!window.confirm(`Delete "${l.title}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/lab/lessons/${l.id}`, { method: "DELETE" });
      if (res.ok) {
        setLessons((prev) => prev?.filter((x) => x.id !== l.id) ?? null);
        toast("Deleted");
      } else toast("Couldn't delete");
    } catch {
      toast("Couldn't delete");
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-[15px] font-semibold text-txt">AI Lesson Builder</h3>
        <Link
          href="/lab/library"
          className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-txt3 transition-colors hover:text-accent"
        >
          <Library className="h-3.5 w-3.5" /> Lesson library <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-txt3">
        Describe a lesson and AI drafts it for you — then edit it and publish to your class.
      </p>

      <div className="rounded-card border border-border bg-panel2 p-2.5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="e.g. a lesson on how AI can sort recycling, for 6th graders"
          disabled={busy}
          className="w-full resize-none border-none bg-transparent px-1.5 py-1 text-[13px] text-txt outline-none placeholder:text-txt3 disabled:opacity-60"
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={() => void createBlank()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border2 bg-panel px-2.5 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Blank
          </button>
          <button
            onClick={() => void generate()}
            disabled={busy || prompt.trim().length < 3}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border-none bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate with AI
          </button>
        </div>
      </div>
      {note && (
        <div className="mt-2 rounded-[9px] border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">{note}</div>
      )}

      <div className="mt-4 space-y-2">
        {lessons === null ? (
          <div className="flex items-center gap-2 px-1 py-2 text-[12px] text-txt3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
          </div>
        ) : lessons.length === 0 ? (
          <p className="px-1 py-2 text-[12px] text-txt3">No lessons yet — generate your first one above.</p>
        ) : (
          lessons.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-card border border-border bg-panel px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-txt">{l.title}</span>
                  <Pill tone={l.status === "published" ? "green" : "neutral"}>{l.status}</Pill>
                </span>
              </span>
              <Link
                href={editHref(l.id)}
                title="Edit"
                className="grid h-7 w-7 place-items-center rounded-md text-txt3 transition-colors hover:bg-panel2 hover:text-txt"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={() => void togglePublish(l)}
                title={l.status === "published" ? "Unpublish" : "Publish to class"}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-panel2",
                  l.status === "published" ? "text-ok" : "text-txt3 hover:text-txt",
                )}
              >
                {l.status === "published" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => void remove(l)}
                title="Delete"
                className="grid h-7 w-7 place-items-center rounded-md text-txt3 transition-colors hover:bg-panel2 hover:text-bad"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
