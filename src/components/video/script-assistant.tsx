"use client";

import { useState } from "react";
import { Sparkles, Loader2, Wand2, ArrowRight, RotateCcw } from "lucide-react";

interface ScriptQuestion {
  key: string;
  text: string;
  options?: string[];
}
type Phase = "idea" | "thinking" | "asking" | "ready";

/** Guided Q&A that helps a user write a strong text-to-video prompt, then hands
 * it to the composer. Optional + collapsible — the prompt box always works on
 * its own. Premium-only (the endpoint enforces it too). */
export function ScriptAssistant({ premium, onUseScript }: { premium: boolean; onUseScript: (script: string) => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idea");
  const [idea, setIdea] = useState("");
  const [input, setInput] = useState("");
  const [questions, setQuestions] = useState<ScriptQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [qIndex, setQIndex] = useState(0);
  const [script, setScript] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!premium) return null;

  async function call(body: { idea: string; answers?: Record<string, string> }) {
    const res = await fetch("/api/video/script", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) return json.data as { done: boolean; questions?: ScriptQuestion[]; script?: string };
    throw new Error(json?.error?.message ?? "Couldn't help right now — write your own.");
  }

  async function start() {
    const i = input.trim();
    if (!i) return;
    setIdea(i);
    setInput("");
    setError(null);
    setPhase("thinking");
    try {
      const data = await call({ idea: i });
      if (data.done && data.script) {
        setScript(data.script);
        setPhase("ready");
      } else {
        setQuestions(data.questions ?? []);
        setAnswers({});
        setQIndex(0);
        setPhase("asking");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("idea");
    }
  }

  async function answer(value: string) {
    const q = questions[qIndex];
    if (!q) return;
    const next = { ...answers, [q.key]: value.trim() || "Skip" };
    setAnswers(next);
    setInput("");
    if (qIndex < questions.length - 1) {
      setQIndex(qIndex + 1);
      return;
    }
    // Last question → synthesize.
    setError(null);
    setPhase("thinking");
    try {
      const data = await call({ idea, answers: next });
      if (data.done && data.script) {
        setScript(data.script);
        setPhase("ready");
      } else {
        setError("Couldn't draft a script — write your own.");
        setPhase("asking");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("asking");
    }
  }

  function reset(toIdea = true) {
    setPhase("idea");
    setQuestions([]);
    setAnswers({});
    setQIndex(0);
    setScript("");
    setError(null);
    setInput("");
    if (toIdea) setIdea("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-2 text-[12.5px] font-medium text-accent transition hover:brightness-110"
      >
        <Sparkles className="h-4 w-4" /> Help me write it
      </button>
    );
  }

  const q = questions[qIndex];

  return (
    <div className="mb-3 rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="text-[12.5px] font-semibold text-txt">Script assistant</span>
        <button type="button" onClick={() => { setOpen(false); reset(); }} className="ml-auto text-[11.5px] text-txt3 transition-colors hover:text-txt">
          Close
        </button>
      </div>

      {phase === "thinking" && (
        <div className="flex items-center gap-2 py-3 text-[12.5px] text-txt2">
          <Loader2 className="h-4 w-4 animate-spin text-accent" /> Thinking…
        </div>
      )}

      {phase === "idea" && (
        <>
          <p className="mb-2 text-[12.5px] text-txt2">What&apos;s your video about? A rough idea is fine.</p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void start(); } }}
            rows={2}
            maxLength={1500}
            placeholder="e.g. a fox exploring a glowing forest at night"
            className="w-full resize-none rounded-lg border border-border2 bg-panel2 px-3 py-2 text-[13px] text-txt outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void start()}
            disabled={!input.trim()}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" /> Get help
          </button>
        </>
      )}

      {phase === "asking" && q && (
        <>
          <div className="mb-1 text-[11px] text-txt3">Question {qIndex + 1} of {questions.length}</div>
          <p className="mb-2.5 text-[13px] font-medium text-txt">{q.text}</p>
          {q.options && q.options.length > 0 && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => void answer(opt)}
                  className="rounded-full border border-border2 bg-panel px-2.5 py-1 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void answer(input); } }}
              placeholder="Type an answer…"
              className="flex-1 rounded-lg border border-border2 bg-panel2 px-3 py-2 text-[13px] text-txt outline-none focus:border-accent"
            />
            <button type="button" onClick={() => void answer(input)} className="inline-flex items-center gap-1 rounded-lg border border-border2 px-2.5 py-2 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt">
              <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void answer("Skip")} className="text-[11.5px] text-txt3 transition-colors hover:text-txt">
              Skip
            </button>
          </div>
        </>
      )}

      {phase === "ready" && (
        <>
          <p className="mb-1.5 text-[11.5px] text-txt3">Here&apos;s a script you can use — tweak it however you like.</p>
          <div className="mb-2.5 rounded-lg border border-border2 bg-panel2 px-3 py-2.5 text-[13px] leading-relaxed text-txt">{script}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { onUseScript(script); setOpen(false); reset(); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white transition hover:brightness-110"
            >
              <Wand2 className="h-4 w-4" /> Use this script
            </button>
            <button type="button" onClick={() => reset(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-border2 px-3 py-2 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt">
              <RotateCcw className="h-3.5 w-3.5" /> Start over
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-2.5 text-[12px] text-warn">{error}</p>}
    </div>
  );
}
