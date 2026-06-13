"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

/* The AI tutor: a friendly helper that knows the current lesson + what the
 * student is doing right now. Floats bottom-right; only appears when an AI key
 * resolves (graceful degradation — the lab works fully without it). */

interface Msg {
  role: "user" | "tutor";
  text: string;
}

export function TutorPanel({
  lessonId,
  stepIndex,
  state,
}: {
  lessonId: string;
  stepIndex: number;
  state: Record<string, unknown>;
}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/lab/tutor")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setAvailable(Boolean(j?.data?.available));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs, busy]);

  if (!available) return null;

  async function ask() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/lab/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, stepIndex, question: q, state }),
      });
      const j = await res.json().catch(() => null);
      const text = j?.data?.ok
        ? (j.data.text as string)
        : j?.data?.unavailable
          ? "I'm taking a quick break — try again in a little bit."
          : "Hmm, I couldn't answer that — try asking another way.";
      setMsgs((m) => [...m, { role: "tutor", text }]);
    } catch {
      setMsgs((m) => [...m, { role: "tutor", text: "Something went wrong — try again." }]);
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-panel px-4 py-2.5 text-[13px] font-semibold text-accent shadow-card transition hover:bg-accent hover:text-accent-ink"
      >
        <MessageCircle className="h-4 w-4" /> Ask the tutor
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[460px] w-[min(360px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-card">
      <div className="flex items-center gap-2 border-b border-border bg-bg2 px-3.5 py-2.5">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="text-[13px] font-semibold text-txt">AI Tutor</span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close tutor"
          className="ml-auto text-txt3 transition-colors hover:text-txt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={bodyRef} className="scroll-area flex-1 space-y-3 overflow-auto p-3.5">
        {msgs.length === 0 && (
          <div className="text-[12.5px] leading-relaxed text-txt3">
            Hi! I&apos;m your AI tutor. Ask me anything about what you&apos;re doing — like
            <span className="text-txt2"> “why did it guess wrong?”</span> or
            <span className="text-txt2"> “what is training?”</span>
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[88%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-txt"
                : "bg-panel2 text-txt2",
            )}
          >
            {m.role === "tutor" ? <Markdown content={m.text} /> : m.text}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-[12px] text-txt3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t border-border p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the tutor…"
          className="flex-1 rounded-lg border border-border2 bg-panel2 px-3 py-2 text-[13px] text-txt outline-none placeholder:text-txt3 focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border-none bg-accent text-accent-ink transition hover:brightness-110 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
