"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, X, PartyPopper } from "lucide-react";
import type { Lesson } from "@/lib/lessons/types";
import { Markdown } from "@/components/ui/markdown";
import { WidgetHost, type LabState } from "@/components/lab/widgets";
import { TutorPanel } from "@/components/lab/tutor-panel";
import { cn } from "@/lib/utils";

/* The guided lesson flow: one step at a time, friendly coach tone. Explain
 * steps just advance; quizzes unlock Next once answered; widget steps unlock
 * once the student has done the hands-on part. */

interface QuizAnswer {
  picked: number;
  correct: boolean;
}

export function LessonRunner({ lesson }: { lesson: Lesson }) {
  const lessonId = lesson.manifest.id;
  const steps = lesson.steps;
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, QuizAnswer>>({});
  const [widgetDone, setWidgetDone] = useState<Record<number, boolean>>({});
  const [labState, setLabState] = useState<LabState>({});
  const [done, setDone] = useState(false);
  const resumed = useRef(false);

  const step = steps[i];
  const total = steps.length;
  const quizCount = useMemo(() => steps.filter((s) => s.kind === "quiz").length, [steps]);

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

  // Resume where the student left off (once).
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    fetch(`/api/lab/progress?lessonId=${encodeURIComponent(lessonId)}`)
      .then((r) => r.json())
      .then((j) => {
        const row = j?.data?.progress;
        if (row && row.status !== "completed" && typeof row.currentStep === "number" && row.currentStep > 0 && row.currentStep < total) {
          setI(row.currentStep);
        }
      })
      .catch(() => {});
  }, [lessonId, total]);

  const canAdvance = useMemo(() => {
    if (step.kind === "quiz") return answers[i] !== undefined;
    if (step.kind === "widget") return widgetDone[i] === true;
    return true;
  }, [step, answers, widgetDone, i]);

  const completeWidget = useCallback(() => {
    setWidgetDone((prev) => (prev[i] ? prev : { ...prev, [i]: true }));
  }, [i]);

  function next() {
    if (!canAdvance) return;
    const ni = i + 1;
    if (ni >= total) {
      const correct = Object.values(answers).filter((a) => a.correct).length;
      const score = quizCount > 0 ? correct / quizCount : 1;
      save(total, "completed", score);
      setDone(true);
      return;
    }
    setI(ni);
    save(ni, "in_progress");
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

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[760px]">
        {/* Header: progress + exit */}
        <div className="mb-5 flex items-center gap-3">
          <Link href="/lab" className="text-txt3 transition-colors hover:text-txt" title="Back to AI Lab">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="truncate text-[13px] font-semibold text-txt">{lesson.manifest.title}</span>
          <span className="ml-auto text-[11.5px] text-txt3">
            Step {i + 1} of {total}
          </span>
        </div>
        <div className="mb-7 h-1.5 overflow-hidden rounded-full bg-panel2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${((i + 1) / total) * 100}%` }}
          />
        </div>

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
              onPick={(picked) =>
                setAnswers((prev) =>
                  prev[i] ? prev : { ...prev, [i]: { picked, correct: picked === step.answer } },
                )
              }
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
