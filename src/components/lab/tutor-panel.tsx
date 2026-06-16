"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles, Lightbulb, Image as ImageIcon, HelpCircle } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { WidgetHost } from "@/components/lab/widgets";
import { pickCoachDiagram } from "@/components/lab/coach-diagrams";
import { cn } from "@/lib/utils";

/* The AI Coach: a friendly helper that sits beside the student the whole way.
 * It is PROACTIVE (greets each step + states the goal), can EXPLAIN a concept,
 * can render an inline DIAGRAM (a real Lab widget, zero AI tokens), and can QUIZ
 * the student to check what they learned. Floats bottom-right.
 *
 * Graceful degradation: the AI chat/chips only appear when an AI key resolves,
 * but the proactive tips + the "show me a picture" diagram work with no AI at
 * all — so the coach is useful even on the free, no-key path. */

interface Msg {
  role: "user" | "coach";
  text: string;
}

export interface CoachStep {
  kind: string;
  title?: string;
  youWillDo?: string;
  widget?: string;
}

export function TutorPanel({
  lessonId,
  stepIndex,
  state,
  concept,
  step,
}: {
  lessonId: string;
  stepIndex: number;
  state: Record<string, unknown>;
  concept?: string;
  step?: CoachStep;
}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const diagram = useMemo(() => pickCoachDiagram(concept, step?.widget), [concept, step?.widget]);
  const conceptLabel = step?.title || concept || "this";

  // Deterministic, zero-token opener tuned to the current step — the proactive
  // "here's what we're doing + how I can help" beat.
  const opener = useMemo(() => {
    const goal = step?.youWillDo || step?.title;
    switch (step?.kind) {
      case "widget":
        return goal
          ? `**Right now:** ${goal}. Want me to explain how it works${diagram ? ", or show you a picture" : ""}?`
          : `Give the activity a try! Want a hand, or${diagram ? " a quick picture" : " a hint"}?`;
      case "explain":
        return `We're on **${conceptLabel}**. Want it even simpler${diagram ? ", or a quick picture" : ""}? I can also ask you a question to make it stick.`;
      case "predict":
        return `Take your best guess — there's no wrong answer here. Want a tiny hint first?`;
      case "quiz":
      case "reflect":
        return `Time to check what you've got. Want me to ask you a question first, or give a hint?`;
      default:
        return `I'm your AI coach — here to help any time. Want me to explain **${conceptLabel}**${diagram ? " or show a picture" : ""}?`;
    }
  }, [step?.kind, step?.youWillDo, step?.title, conceptLabel, diagram]);

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

  // A fresh proactive nudge each time the step changes.
  useEffect(() => {
    setTipDismissed(false);
  }, [stepIndex]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs, busy]);

  // Nothing useful to offer (no AI key AND no picture for this topic) → hide.
  if (!available && !diagram) return null;

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/lab/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, stepIndex, concept, question, state }),
      });
      const j = await res.json().catch(() => null);
      const text = j?.data?.ok
        ? (j.data.text as string)
        : j?.data?.unavailable
          ? "I'm taking a quick break — try again in a little bit."
          : "Hmm, I couldn't answer that — try asking another way.";
      setMsgs((m) => [...m, { role: "coach", text }]);
    } catch {
      setMsgs((m) => [...m, { role: "coach", text: "Something went wrong — try again." }]);
    }
    setBusy(false);
  }

  function submitInput() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    void ask(q);
  }

  // ---- collapsed: a launcher with a proactive one-line tip ----
  if (!open) {
    return (
      <div className="fixed bottom-5 right-5 z-40 flex max-w-[min(320px,calc(100vw-2.5rem))] flex-col items-end gap-2">
        {!tipDismissed && (
          <button
            onClick={() => setOpen(true)}
            className="fade-up group relative rounded-2xl rounded-br-sm border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-panel px-3.5 py-2.5 text-left text-[12.5px] leading-relaxed text-txt2 shadow-card transition hover:border-accent"
          >
            <span
              role="button"
              tabIndex={0}
              aria-label="Dismiss tip"
              onClick={(e) => {
                e.stopPropagation();
                setTipDismissed(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  setTipDismissed(true);
                }
              }}
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border2 bg-panel text-txt3 opacity-0 transition hover:text-txt group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </span>
            <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-accent">
              <Sparkles className="h-3 w-3" /> Coach
            </span>
            <Markdown content={opener} />
          </button>
        )}
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-panel px-4 py-2.5 text-[13px] font-semibold text-accent shadow-card transition hover:bg-accent hover:text-accent-ink"
        >
          <MessageCircle className="h-4 w-4" /> Ask the coach
        </button>
      </div>
    );
  }

  const aiReady = available;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 flex h-[500px] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-card">
        <div className="flex items-center gap-2 border-b border-border bg-bg2 px-3.5 py-2.5">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-[13px] font-semibold text-txt">AI Coach</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close coach"
            className="ml-auto text-txt3 transition-colors hover:text-txt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={bodyRef} className="scroll-area flex-1 space-y-3 overflow-auto p-3.5">
          {/* Proactive opener — always reflects the current step */}
          <div className="rounded-xl bg-panel2 px-3 py-2.5 text-[13px] leading-relaxed text-txt2">
            <Markdown content={opener} />
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-1.5">
            {aiReady && (
              <ChipButton onClick={() => void ask(`Explain "${conceptLabel}" to me super simply, like I'm 11 — 2 to 3 sentences with one tiny everyday example.`)} disabled={busy}>
                <Lightbulb className="h-3.5 w-3.5" /> Explain it simply
              </ChipButton>
            )}
            {diagram && (
              <ChipButton onClick={() => setDiagramOpen(true)} disabled={false}>
                <ImageIcon className="h-3.5 w-3.5" /> Show me a picture
              </ChipButton>
            )}
            {aiReady && (
              <ChipButton onClick={() => void ask(`Quiz me: ask me ONE short question to check if I really understand ${conceptLabel}. Just ask the question — don't tell me the answer yet.`)} disabled={busy}>
                <HelpCircle className="h-3.5 w-3.5" /> Quiz me
              </ChipButton>
            )}
          </div>

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
              {m.role === "coach" ? <Markdown content={m.text} /> : m.text}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[12px] text-txt3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
            </div>
          )}
          {!aiReady && (
            <div className="text-[11.5px] leading-relaxed text-txt3">
              Tip: turn on an AI key in Settings to chat with the coach. The picture above still works for free.
            </div>
          )}
        </div>

        {aiReady && (
          <form
            className="flex items-center gap-2 border-t border-border p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              submitInput();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the coach…"
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
        )}
      </div>

      {/* Inline diagram — a real interactive Lab widget as a zero-token explainer */}
      {diagram && diagramOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
          onClick={() => setDiagramOpen(false)}
        >
          <div
            className="flex max-h-[88vh] w-[min(560px,94vw)] flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border bg-bg2 px-4 py-3">
              <ImageIcon className="h-4 w-4 text-accent" />
              <span className="text-[13.5px] font-semibold text-txt">{diagram.title}</span>
              <button
                onClick={() => setDiagramOpen(false)}
                aria-label="Close picture"
                className="ml-auto text-txt3 transition-colors hover:text-txt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scroll-area overflow-auto p-4">
              <p className="mb-3 text-[12.5px] leading-relaxed text-txt2">{diagram.caption}</p>
              <WidgetHost widget={diagram.widget} config={diagram.config} onComplete={() => {}} onState={() => {}} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChipButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full border border-border2 bg-panel2 px-2.5 py-1 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-40"
    >
      {children}
    </button>
  );
}
