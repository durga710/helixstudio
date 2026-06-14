"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  PartyPopper,
  BookOpen,
  Target,
  Sparkles,
  Send,
  Loader2,
  Lightbulb,
  Clock,
  Play,
} from "lucide-react";
import type { Lesson, RecallCheck } from "@/lib/lessons/types";
import { Markdown } from "@/components/ui/markdown";
import { WidgetHost, type LabState } from "@/components/lab/widgets";
import { TutorPanel } from "@/components/lab/tutor-panel";
import { cn } from "@/lib/utils";

/* The guided lesson flow. Each step is rendered generically from data so the
 * look can be re-skinned without touching content. The step vocabulary encodes
 * a learning arc: a framing card up front, "what you'll do" before each hands-on
 * step, predict-before-you're-told, reveal, then explain-it-back + recall — so a
 * learner is oriented the whole way and actually consolidates, not just pokes. */

interface QuizAnswer {
  picked: number;
  correct: boolean;
}

export function LessonRunner({ lesson }: { lesson: Lesson }) {
  const lessonId = lesson.manifest.id;
  const steps = lesson.steps;
  const objectives = lesson.manifest.objectives ?? [];
  const glossary = lesson.manifest.glossary ?? [];
  const hasIntro = objectives.length > 0;

  const [started, setStarted] = useState(!hasIntro);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, QuizAnswer>>({});
  const [predicted, setPredicted] = useState<Record<number, number>>({});
  const [widgetDone, setWidgetDone] = useState<Record<number, boolean>>({});
  const [labState, setLabState] = useState<LabState>({});
  const [wordsOpen, setWordsOpen] = useState(false);
  const [done, setDone] = useState(false);
  const resumed = useRef(false);

  const step = steps[i];
  const total = steps.length;
  // Recognition checks that count toward the score: quizzes + reflect recalls.
  const scoredCount = useMemo(
    () => steps.filter((s) => s.kind === "quiz" || s.kind === "reflect").length,
    [steps],
  );

  const save = useCallback(
    (currentStep: number, status: "in_progress" | "completed", quizScore?: number) => {
      void fetch("/api/lab/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, currentStep, status, ...(quizScore !== undefined && { quizScore }) }),
      }).catch(() => {});
    },
    [lessonId],
  );

  // Resume where the student left off (once). If they were mid-lesson, skip the
  // framing card.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    fetch(`/api/lab/progress?lessonId=${encodeURIComponent(lessonId)}`)
      .then((r) => r.json())
      .then((j) => {
        const row = j?.data?.progress;
        if (row && row.status !== "completed" && typeof row.currentStep === "number" && row.currentStep > 0 && row.currentStep < total) {
          setI(row.currentStep);
          setStarted(true);
        }
      })
      .catch(() => {});
  }, [lessonId, total]);

  const canAdvance = useMemo(() => {
    if (step.kind === "quiz" || step.kind === "reflect") return answers[i] !== undefined;
    if (step.kind === "widget") return widgetDone[i] === true;
    if (step.kind === "predict") return predicted[i] !== undefined;
    return true;
  }, [step, answers, predicted, widgetDone, i]);

  const completeWidget = useCallback(() => {
    setWidgetDone((prev) => (prev[i] ? prev : { ...prev, [i]: true }));
  }, [i]);

  const recordAnswer = useCallback(
    (picked: number, answer: number) => {
      setAnswers((prev) => (prev[i] ? prev : { ...prev, [i]: { picked, correct: picked === answer } }));
    },
    [i],
  );

  function next() {
    if (!canAdvance) return;
    const ni = i + 1;
    if (ni >= total) {
      const correct = Object.values(answers).filter((a) => a.correct).length;
      const score = scoredCount > 0 ? correct / scoredCount : 1;
      save(total, "completed", score);
      setDone(true);
      return;
    }
    setI(ni);
    setWordsOpen(false);
    save(ni, "in_progress");
  }

  // ---- the framing / intro card (beat 1: orient before you begin) ----
  if (hasIntro && !started && !done) {
    return (
      <div className="pad-screen">
        <div className="mx-auto max-w-[620px]">
          <div className="mb-5 flex items-center gap-3">
            <Link href="/lab" className="text-txt3 transition-colors hover:text-txt" title="Back to AI Lab">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="text-[13px] font-semibold text-txt">{lesson.manifest.title}</span>
          </div>
          <div className="rounded-card border border-border bg-panel p-7 shadow-card">
            <div className="inline-flex items-center gap-2 rounded-full border border-border2 bg-panel2 px-2.5 py-1 text-[11px] capitalize text-txt3">
              <Sparkles className="h-3 w-3 text-accent" /> {lesson.manifest.level}
              <span className="text-txt3">·</span>
              <Clock className="h-3 w-3" /> ~{lesson.manifest.estMinutes} min
            </div>
            <h1 className="mt-3 text-[24px] font-bold tracking-tight">{lesson.manifest.title}</h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-txt2">{lesson.manifest.blurb}</p>

            <div className="mt-5 rounded-[12px] border border-border2 bg-panel2 p-4">
              <div className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-txt">
                <Target className="h-4 w-4 text-accent" /> By the end, you&apos;ll get:
              </div>
              <ul className="space-y-2">
                {objectives.map((o, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-txt2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-4 text-[12.5px] leading-relaxed text-txt3">
              It&apos;s all hands-on, one small step at a time. Stuck on a word? Tap{" "}
              <span className="inline-flex items-center gap-1 text-txt2"><BookOpen className="h-3 w-3" /> Words</span> any time.
              {glossary.length === 0 ? "" : ""} You can ask the tutor too.
            </p>

            <button
              onClick={() => setStarted(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-[10px] border-none bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink transition hover:brightness-110"
            >
              <Play className="h-4 w-4" /> Let&apos;s go
            </button>
          </div>
        </div>
        <TutorPanel lessonId={lessonId} stepIndex={0} state={labState} />
      </div>
    );
  }

  if (done) {
    return (
      <div className="pad-screen">
        <div className="mx-auto grid min-h-[60vh] max-w-[560px] place-items-center text-center">
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#00ffd1] via-accent to-[#c084fc]">
              <PartyPopper className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-[22px] font-bold tracking-tight">You did it!</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-txt2">
              You just trained a real AI and learned how it thinks — the same idea behind the
              biggest AI systems in the world.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <Link
                href="/lab"
                className="rounded-[10px] border border-border2 bg-panel2 px-4 py-2 text-[13px] text-txt2 transition-colors hover:border-accent hover:text-txt"
              >
                Back to AI Lab
              </Link>
              <button
                onClick={() => {
                  setI(0);
                  setDone(false);
                  setStarted(!hasIntro);
                }}
                className="rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110"
              >
                Do it again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const youWillDo = "youWillDo" in step ? step.youWillDo : undefined;

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[760px]">
        {/* Header: progress + words + exit */}
        <div className="mb-5 flex items-center gap-3">
          <Link href="/lab" className="text-txt3 transition-colors hover:text-txt" title="Back to AI Lab">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="truncate text-[13px] font-semibold text-txt">{lesson.manifest.title}</span>
          <div className="ml-auto flex items-center gap-3">
            {glossary.length > 0 && (
              <button
                onClick={() => setWordsOpen((o) => !o)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                  wordsOpen
                    ? "border-accent bg-panel2 text-txt"
                    : "border-border2 bg-panel2 text-txt2 hover:border-accent hover:text-txt",
                )}
              >
                <BookOpen className="h-3.5 w-3.5" /> Words
              </button>
            )}
            <span className="text-[11.5px] text-txt3">
              Step {i + 1} of {total}
            </span>
          </div>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-panel2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${((i + 1) / total) * 100}%` }}
          />
        </div>

        {/* Glossary panel */}
        {wordsOpen && glossary.length > 0 && (
          <div className="mb-4 rounded-card border border-border bg-panel2 p-4">
            <div className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-txt">
              <BookOpen className="h-4 w-4 text-accent" /> Words to know
            </div>
            <dl className="grid gap-2.5 sm:grid-cols-2">
              {glossary.map((g) => (
                <div key={g.term} className="rounded-[10px] border border-border2 bg-panel px-3 py-2">
                  <dt className="text-[12.5px] font-semibold text-txt">{g.term}</dt>
                  <dd className="mt-0.5 text-[12px] leading-relaxed text-txt3">{g.def}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* "What you'll do" frame */}
        {youWillDo && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1.5 text-[12px] font-medium text-txt2">
            <Lightbulb className="h-3.5 w-3.5 text-accent" /> You&apos;ll: {youWillDo}
          </div>
        )}

        {/* Step body */}
        <div className="rounded-card border border-border bg-panel p-6 shadow-card">
          {step.title && (
            <h2 className="mb-3 text-[18px] font-bold tracking-tight">
              <Markdown content={step.title} />
            </h2>
          )}

          {step.kind === "explain" && (
            <div className="text-[14.5px] leading-relaxed text-txt2">
              <Markdown content={step.body} />
            </div>
          )}

          {step.kind === "widget" && (
            <div className="space-y-4">
              {step.body && (
                <div className="text-[14px] leading-relaxed text-txt2">
                  <Markdown content={step.body} />
                </div>
              )}
              <WidgetHost
                key={i}
                widget={step.widget}
                config={step.config}
                onComplete={completeWidget}
                onState={setLabState}
              />
            </div>
          )}

          {step.kind === "quiz" && (
            <QuizStep
              key={i}
              question={step.question}
              choices={step.choices}
              answer={step.answer}
              explain={step.explain}
              picked={answers[i]?.picked ?? null}
              onPick={(picked) => recordAnswer(picked, step.answer)}
            />
          )}

          {step.kind === "predict" && (
            <PredictStep
              key={i}
              prompt={step.prompt}
              choices={step.choices}
              afterPick={step.afterPick}
              picked={predicted[i] ?? null}
              onPick={(picked) => setPredicted((prev) => (prev[i] !== undefined ? prev : { ...prev, [i]: picked }))}
            />
          )}

          {step.kind === "reflect" && (
            <ReflectStep
              key={i}
              lessonId={lessonId}
              stepIndex={i}
              prompt={step.prompt}
              placeholder={step.placeholder}
              recall={step.recall}
              labState={labState}
              recallPicked={answers[i]?.picked ?? null}
              onRecall={(picked) => recordAnswer(picked, step.recall.answer)}
            />
          )}
        </div>

        {/* Footer nav */}
        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={() => setI(Math.max(0, i - 1))}
            disabled={i === 0}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border2 bg-panel2 px-3.5 py-2 text-[13px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <button
            onClick={next}
            disabled={!canAdvance}
            className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {i + 1 >= total ? "Finish" : "Next"} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <TutorPanel lessonId={lessonId} stepIndex={i} state={labState} />
    </div>
  );
}

function QuizStep({
  question,
  choices,
  answer,
  explain,
  picked,
  onPick,
}: {
  question: string;
  choices: string[];
  answer: number;
  explain?: string;
  picked: number | null;
  onPick: (i: number) => void;
}) {
  const answered = picked !== null;
  return (
    <div>
      <div className="mb-4 text-[14.5px] font-medium text-txt">
        <Markdown content={question} />
      </div>
      <div className="space-y-2">
        {choices.map((c, idx) => {
          const isPicked = picked === idx;
          const isAnswer = idx === answer;
          const show = answered && (isAnswer || isPicked);
          return (
            <button
              key={idx}
              onClick={() => onPick(idx)}
              disabled={answered}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-left text-[13.5px] transition-colors disabled:cursor-default",
                !answered && "border-border2 bg-panel2 text-txt2 hover:border-accent hover:text-txt",
                answered && !show && "border-border bg-panel2 text-txt3 opacity-60",
                show && isAnswer && "border-ok bg-panel2 text-txt",
                show && isPicked && !isAnswer && "border-bad bg-panel2 text-txt",
              )}
            >
              <span className="flex-1">{c}</span>
              {show && isAnswer && <Check className="h-4 w-4 shrink-0 text-ok" />}
              {show && isPicked && !isAnswer && <X className="h-4 w-4 shrink-0 text-bad" />}
            </button>
          );
        })}
      </div>
      {answered && explain && (
        <div className="mt-4 rounded-[10px] border border-border bg-panel2 px-3.5 py-3 text-[13px] leading-relaxed text-txt2">
          <Markdown content={explain} />
        </div>
      )}
    </div>
  );
}

/* Predict: a low-stakes guess BEFORE the reveal. No "wrong" — picking primes the
 * learner so the upcoming hands-on part lands. */
function PredictStep({
  prompt,
  choices,
  afterPick,
  picked,
  onPick,
}: {
  prompt: string;
  choices: string[];
  afterPick?: string;
  picked: number | null;
  onPick: (i: number) => void;
}) {
  const answered = picked !== null;
  return (
    <div>
      <div className="mb-1 inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-accent">
        <Target className="h-3.5 w-3.5" /> Your guess
      </div>
      <div className="mb-4 text-[14.5px] font-medium text-txt">
        <Markdown content={prompt} />
      </div>
      <div className="space-y-2">
        {choices.map((c, idx) => {
          const isPicked = picked === idx;
          return (
            <button
              key={idx}
              onClick={() => onPick(idx)}
              disabled={answered}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-left text-[13.5px] transition-colors disabled:cursor-default",
                !answered && "border-border2 bg-panel2 text-txt2 hover:border-accent hover:text-txt",
                answered && !isPicked && "border-border bg-panel2 text-txt3 opacity-60",
                answered && isPicked && "border-accent bg-panel2 text-txt",
              )}
            >
              <span className="flex-1">{c}</span>
              {isPicked && <Check className="h-4 w-4 shrink-0 text-accent" />}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-4 rounded-[10px] border border-border bg-panel2 px-3.5 py-3 text-[13px] leading-relaxed text-txt2">
          {afterPick ? <Markdown content={afterPick} /> : "Good guess — keep it in mind. Let's find out together. →"}
        </div>
      )}
    </div>
  );
}

/* Reflect: explain-it-back (production — the strongest retention mechanic) with
 * a warm AI-tutor reaction, plus a zero-token recall check that gates Next. The
 * write-up is encouraged but optional; the recall is the gate. */
function ReflectStep({
  lessonId,
  stepIndex,
  prompt,
  placeholder,
  recall,
  labState,
  recallPicked,
  onRecall,
}: {
  lessonId: string;
  stepIndex: number;
  prompt: string;
  placeholder?: string;
  recall: RecallCheck;
  labState: LabState;
  recallPicked: number | null;
  onRecall: (i: number) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function getFeedback() {
    const t = text.trim();
    if (t.length < 3 || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/lab/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          stepIndex,
          question: `I'm explaining this in my own words: "${prompt}". Here's my answer: "${t}". In 2–3 warm sentences, tell me what I got right and gently fix anything I missed.`,
          state: labState,
        }),
      });
      const j = await res.json().catch(() => null);
      if (j?.data?.ok) setFeedback(j.data.text as string);
      else if (j?.data?.unavailable) setUnavailable(true);
      else setFeedback("Nice effort writing that out — explaining it in your own words is exactly how it sticks!");
    } catch {
      setFeedback("Nice effort writing that out — explaining it in your own words is exactly how it sticks!");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      {/* Explain-it-back */}
      <div>
        <div className="mb-1 inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-accent">
          <Sparkles className="h-3.5 w-3.5" /> Say it your way
        </div>
        <div className="mb-3 text-[14.5px] font-medium text-txt">
          <Markdown content={prompt} />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? "Type it how you'd explain it to a friend…"}
          rows={3}
          className="w-full resize-y rounded-[10px] border border-border2 bg-panel2 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-txt outline-none placeholder:text-txt3 focus:border-accent"
        />
        {!unavailable && (
          <button
            onClick={getFeedback}
            disabled={busy || text.trim().length < 3}
            className="mt-2 inline-flex items-center gap-1.5 rounded-[10px] border border-border2 bg-panel2 px-3 py-1.5 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {busy ? "Reading…" : "Check my explanation"}
          </button>
        )}
        {feedback && (
          <div className="mt-3 rounded-[10px] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3.5 py-3 text-[13px] leading-relaxed text-txt2">
            <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent">
              <Sparkles className="h-3 w-3" /> Tutor
            </div>
            <Markdown content={feedback} />
          </div>
        )}
      </div>

      {/* Recall check (gates Next) */}
      <div className="border-t border-border pt-4">
        <div className="mb-1 inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-txt3">
          <Target className="h-3.5 w-3.5" /> Quick recall
        </div>
        <QuizStep
          question={recall.question}
          choices={recall.choices}
          answer={recall.answer}
          explain={recall.explain}
          picked={recallPicked}
          onPick={onRecall}
        />
      </div>
    </div>
  );
}
