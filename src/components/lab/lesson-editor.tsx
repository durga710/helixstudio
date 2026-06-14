"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Eye,
  Save,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Globe,
} from "lucide-react";
import type { Lesson, LessonManifest, LessonStep } from "@/lib/lessons/types";
import { WIDGET_CATALOG } from "@/lib/lessons/widgets";
import { LessonRunner } from "@/components/lab/lesson-runner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/* The teacher's lesson editor: tweak the meta, edit/reorder/add/remove steps,
 * preview exactly what students see, then save + publish. */

const ICONS = ["Sparkles", "Brain", "Boxes", "GitBranch", "LineChart", "Globe", "Joystick"];
const LEVELS = ["beginner", "intermediate", "advanced"] as const;

export function LessonEditor({
  lessonId,
  spaceId,
  initialStatus,
  initialPublic,
  initialManifest,
  initialSteps,
}: {
  lessonId: string;
  spaceId: string;
  initialStatus: string;
  initialPublic: boolean;
  initialManifest: LessonManifest;
  initialSteps: LessonStep[];
}) {
  const { toast } = useToast();
  const [manifest, setManifest] = useState<LessonManifest>(initialManifest);
  const [steps, setSteps] = useState<LessonStep[]>(initialSteps);
  const [status, setStatus] = useState(initialStatus);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  async function toggleShare() {
    const next = !isPublic;
    if (next && !(await save())) return;
    try {
      const res = await fetch(`/api/lab/lessons/${lessonId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: next }),
      });
      if (res.ok) {
        setIsPublic(next);
        if (next) setStatus("published");
        toast(next ? "Shared to the lesson library 🌍" : "Removed from the library");
      } else toast("Couldn't update sharing");
    } catch {
      toast("Couldn't update sharing");
    }
  }

  function setM<K extends keyof LessonManifest>(k: K, v: LessonManifest[K]) {
    setManifest((m) => ({ ...m, [k]: v }));
  }
  function updateStep(i: number, s: LessonStep) {
    setSteps((prev) => prev.map((x, idx) => (idx === i ? s : x)));
  }
  function deleteStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addStep(kind: LessonStep["kind"]) {
    const s: LessonStep =
      kind === "explain"
        ? { kind: "explain", title: "", body: "New text…" }
        : kind === "quiz"
          ? { kind: "quiz", question: "New question?", choices: ["Yes", "No"], answer: 0, explain: "" }
          : { kind: "widget", widget: WIDGET_CATALOG[0]?.id ?? "classifier", title: "", body: "" };
    setSteps((prev) => [...prev, s]);
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(`/api/lab/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest, steps }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        toast("Saved");
        return true;
      }
      toast(json?.error?.message ?? "Couldn't save");
      return false;
    } catch {
      toast("Couldn't save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    const publish = status !== "published";
    if (publish && !(await save())) return;
    try {
      const res = await fetch(`/api/lab/lessons/${lessonId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish }),
      });
      if (res.ok) {
        setStatus(publish ? "published" : "draft");
        toast(publish ? "Published to your class 🎉" : "Unpublished");
      } else toast("Couldn't update");
    } catch {
      toast("Couldn't update");
    }
  }

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[760px]">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/space/${spaceId}/instructor`}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-txt3 transition-colors hover:text-txt"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPreview(true)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border2 bg-panel2 px-3 py-1.5 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt"
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border2 bg-panel2 px-3 py-1.5 text-[12.5px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </button>
            <button
              onClick={() => void togglePublish()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[10px] border-none px-3.5 py-1.5 text-[12.5px] font-semibold transition",
                status === "published"
                  ? "bg-panel2 text-txt2 hover:text-txt"
                  : "bg-accent text-accent-ink hover:brightness-110",
              )}
            >
              {status === "published" ? "Unpublish" : "Publish to class"}
            </button>
            <button
              onClick={() => void toggleShare()}
              title="Share publicly so other teachers can use it"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[12.5px] transition-colors",
                isPublic
                  ? "border-ok text-ok hover:bg-panel2"
                  : "border-border2 bg-panel2 text-txt2 hover:border-accent hover:text-txt",
              )}
            >
              <Globe className="h-3.5 w-3.5" /> {isPublic ? "In library" : "Share to library"}
            </button>
          </span>
        </div>

        {/* Meta */}
        <div className="rounded-card border border-border bg-panel p-4">
          <input
            value={manifest.title}
            onChange={(e) => setM("title", e.target.value)}
            placeholder="Lesson title"
            className="w-full border-none bg-transparent text-[18px] font-bold text-txt outline-none placeholder:text-txt3"
          />
          <input
            value={manifest.blurb}
            onChange={(e) => setM("blurb", e.target.value)}
            placeholder="One-line description (shown on the card)"
            className="mt-1 w-full border-none bg-transparent text-[13px] text-txt2 outline-none placeholder:text-txt3"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
            <label className="flex items-center gap-1.5 text-txt3">
              Level
              <select
                value={manifest.level}
                onChange={(e) => setM("level", e.target.value as LessonManifest["level"])}
                className="rounded-md border border-border2 bg-panel2 px-2 py-1 text-txt2 outline-none focus:border-accent"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-txt3">
              Minutes
              <input
                type="number"
                min={1}
                max={180}
                value={manifest.estMinutes}
                onChange={(e) => setM("estMinutes", Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
                className="w-16 rounded-md border border-border2 bg-panel2 px-2 py-1 text-txt2 outline-none focus:border-accent"
              />
            </label>
            <label className="flex items-center gap-1.5 text-txt3">
              Icon
              <select
                value={manifest.icon}
                onChange={(e) => setM("icon", e.target.value)}
                className="rounded-md border border-border2 bg-panel2 px-2 py-1 text-txt2 outline-none focus:border-accent"
              >
                {ICONS.map((ic) => (
                  <option key={ic} value={ic}>
                    {ic}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Steps */}
        <div className="mt-4 space-y-2.5">
          {steps.map((s, i) => (
            <StepCard
              key={i}
              step={s}
              index={i}
              total={steps.length}
              onChange={(ns) => updateStep(i, ns)}
              onDelete={() => deleteStep(i)}
              onMove={(d) => moveStep(i, d)}
            />
          ))}
        </div>

        {/* Add */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-txt3">Add a step:</span>
          {(["explain", "quiz", "widget"] as const).map((k) => (
            <button
              key={k}
              onClick={() => addStep(k)}
              className="inline-flex items-center gap-1 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[12px] capitalize text-txt2 transition-colors hover:border-accent hover:text-txt"
            >
              <Plus className="h-3 w-3" /> {k}
            </button>
          ))}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 border-b border-border bg-panel px-4 py-2.5">
            <Eye className="h-4 w-4 text-accent" />
            <span className="text-[13px] font-semibold text-txt">Preview — what students see</span>
            <button
              onClick={() => setPreview(false)}
              className="ml-auto inline-flex items-center gap-1 rounded-card border border-border2 bg-panel2 px-2.5 py-1 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
            >
              <X className="h-3.5 w-3.5" /> Close
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-bg">
            <LessonRunner lesson={{ manifest: { ...manifest, id: lessonId }, steps } as Lesson} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ step card ------------------------------ */

function StepCard({
  step,
  index,
  total,
  onChange,
  onDelete,
  onMove,
}: {
  step: LessonStep;
  index: number;
  total: number;
  onChange: (s: LessonStep) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    step.kind === "explain"
      ? step.title || step.body.slice(0, 60)
      : step.kind === "quiz"
        ? step.question
        : `Widget: ${step.widget}`;

  return (
    <div className="rounded-card border border-border bg-panel">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} className="text-txt3 hover:text-txt">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-txt3">
          {step.kind}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt2">{summary}</span>
        <button onClick={() => onMove(-1)} disabled={index === 0} className="text-txt3 hover:text-txt disabled:opacity-30">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-txt3 hover:text-txt disabled:opacity-30">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete} className="text-txt3 hover:text-bad">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border px-3 py-3">
          {step.kind === "explain" && (
            <>
              <Field label="Title (optional)">
                <input
                  value={step.title ?? ""}
                  onChange={(e) => onChange({ ...step, title: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Text (markdown)">
                <textarea
                  value={step.body}
                  onChange={(e) => onChange({ ...step, body: e.target.value })}
                  rows={4}
                  className={cn(inputCls, "resize-y font-sans")}
                />
              </Field>
            </>
          )}

          {step.kind === "quiz" && (
            <>
              <Field label="Question">
                <input
                  value={step.question}
                  onChange={(e) => onChange({ ...step, question: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Choices (pick the correct one)">
                <div className="space-y-1.5">
                  {step.choices.map((c, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`ans-${index}`}
                        checked={step.answer === ci}
                        onChange={() => onChange({ ...step, answer: ci })}
                      />
                      <input
                        value={c}
                        onChange={(e) =>
                          onChange({ ...step, choices: step.choices.map((x, xi) => (xi === ci ? e.target.value : x)) })
                        }
                        className={cn(inputCls, "flex-1")}
                      />
                      <button
                        onClick={() => {
                          if (step.choices.length <= 2) return;
                          const choices = step.choices.filter((_, xi) => xi !== ci);
                          onChange({ ...step, choices, answer: Math.min(step.answer, choices.length - 1) });
                        }}
                        className="text-txt3 hover:text-bad disabled:opacity-30"
                        disabled={step.choices.length <= 2}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {step.choices.length < 6 && (
                    <button
                      onClick={() => onChange({ ...step, choices: [...step.choices, "New choice"] })}
                      className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
                    >
                      <Plus className="h-3 w-3" /> add choice
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Explanation (shown after answering)">
                <input
                  value={step.explain ?? ""}
                  onChange={(e) => onChange({ ...step, explain: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {step.kind === "widget" && (
            <>
              <Field label="Interactive widget">
                <select
                  value={step.widget}
                  onChange={(e) => onChange({ ...step, widget: e.target.value })}
                  className={inputCls}
                >
                  {WIDGET_CATALOG.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Intro text (optional)">
                <textarea
                  value={step.body ?? ""}
                  onChange={(e) => onChange({ ...step, body: e.target.value })}
                  rows={2}
                  className={cn(inputCls, "resize-y font-sans")}
                />
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[13px] text-txt outline-none placeholder:text-txt3 focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-txt3">{label}</span>
      {children}
    </label>
  );
}
