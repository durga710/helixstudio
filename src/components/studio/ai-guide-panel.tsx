"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Brain, Loader2 } from "lucide-react";

/* The left pane of the AI workspace: an AI guide that teaches AND navigates —
 * when you ask to learn/build a concept, it opens the matching studio on the
 * right (onOpenStudio) and coaches you through it, fed the studio's live state. */

interface Msg {
  role: "user" | "guide";
  text: string;
}

const STARTERS = [
  "Train an image classifier I can test live",
  "Build a decision tree and see how it splits",
  "Watch a neural network learn, step by step",
  "Predict numbers with a regression model",
  "Explain machine learning like I'm brand new",
];

export function AiGuidePanel({
  openStudioId,
  liveState,
  onOpenStudio,
}: {
  openStudioId: string | null;
  liveState: Record<string, unknown>;
  onOpenStudio: (id: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/lab/guide")
      .then((r) => r.json())
      .then((j) => setAvailable(Boolean(j?.data?.available)))
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/lab/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, openStudio: openStudioId ?? undefined, state: liveState }),
      });
      const j = await res.json().catch(() => null);
      const data = j?.data;
      if (data?.ok) {
        setMsgs((m) => [...m, { role: "guide", text: data.reply }]);
        if (data.openStudio) onOpenStudio(data.openStudio);
      } else if (data?.unavailable) {
        setMsgs((m) => [...m, { role: "guide", text: "I can't chat without an AI key set up — but you can still pick a studio on the right and start building. 👉" }]);
      } else {
        setMsgs((m) => [...m, { role: "guide", text: "Hmm, I couldn't answer that — try again." }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "guide", text: "Network hiccup — try again." }]);
    }
    setBusy(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-card border border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl">
          <Brain className="h-4 w-4 text-accent" />
        </span>
        <span className="text-[13px] font-semibold text-txt">AI Guide</span>
        <span className="ml-auto text-[11px] text-txt3">teaches & opens studios</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="text-[13px] leading-relaxed text-txt2">
            <div className="mb-3 flex items-center gap-2 text-txt">
              <Sparkles className="h-4 w-4 text-accent" /> Hey! I&apos;m your AI guide.
            </div>
            Tell me what you want to build or learn — I&apos;ll open the right studio and walk you through it, step
            by step. Not sure where to start? Try one of these:
            <div className="mt-4 flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-lg border border-border2 bg-panel2 px-3 py-2 text-left text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-[13px] text-accent-ink"
                  : "max-w-[88%] rounded-2xl rounded-bl-sm border border-border2 bg-panel2 px-3.5 py-2 text-[13px] leading-relaxed text-txt2"
              }
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-[12px] text-txt3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t border-border px-3 py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={available === false ? "Pick a studio on the right →" : "Ask the guide anything…"}
          className="flex-1 rounded-xl border border-border bg-bg2 px-3.5 py-2.5 text-sm text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-none bg-accent text-accent-ink transition hover:brightness-110 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
