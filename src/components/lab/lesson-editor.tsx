"use client";

import { useRef, useState } from "react";
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
  Sparkles,
  Send,
  Undo2,
  Wand2,
  Boxes,
} from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import type { GlossaryTerm, Lesson, LessonManifest, LessonStep } from "@/lib/lessons/types";
import { WIDGET_CATALOG } from "@/lib/lessons/widgets";
import { DATASETS } from "@/components/lab/datasets";
import { LessonRunner } from "@/components/lab/lesson-runner";
import { WidgetStore } from "@/components/lab/widget-store";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/* The teacher's lesson editor: tweak the meta, edit/reorder/add/remove steps,
 * preview exactly what students see, then save + publish. */

const ICONS = ["Sparkles", "Brain", "Boxes", "GitBranch", "LineChart", "Globe", "Joystick"];
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const DATASET_IDS = Object.keys(DATASETS);
/** Phase options for the phased widgets (only neuronBoundary today). */
const WIDGET_PHASES: Record<string, string[]> = {
  neuronBoundary: ["explore", "step", "reveal", "generalize", "youdo", "fail"],
};

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
  const [storeOpen, setStoreOpen] = useState(false);
  // One-step undo for AI edits — stash the doc before applying.
  const lastDoc = useRef<{ manifest: LessonManifest; steps: LessonStep[] } | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  function applyAiEdit(lesson: { manifest: LessonManifest; steps: LessonStep[] }) {
    lastDoc.current = { manifest, steps };
    setManifest({ ...lesson.manifest, id: lessonId });
    setSteps(lesson.steps);
    setCanUndo(true);
  }
  function undoAiEdit() {
    if (!lastDoc.current) return;
    setManifest(lastDoc.current.manifest);
    setSteps(lastDoc.current.steps);
    lastDoc.current = null;
    setCanUndo(false);
  }

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
          : kind === "predict"
            ? { kind: "predict", prompt: "What do you think will happen?", choices: ["Option A", "Option B"], afterPick: "Let's find out. →" }
            : kind === "reflect"
              ? {
                  kind: "reflect",
                  prompt: "Explain it in your own words.",
                  recall: { question: "Quick check?", choices: ["Right answer", "A wrong one"], answer: 0 },
                }
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

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ObjectivesEditor
              objectives={manifest.objectives ?? []}
              onChange={(objectives) => setM("objectives", objectives.length ? objectives : undefined)}
            />
            <GlossaryEditor
              glossary={manifest.glossary ?? []}
              onChange={(glossary) => setM("glossary", glossary.length ? glossary : undefined)}
            />
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
          {(["explain", "predict", "quiz", "reflect"] as const).map((k) => (
            <button
              key={k}
              onClick={() => addStep(k)}
              className="inline-flex items-center gap-1 rounded-md border border-border2 bg-panel2 px-2.5 py-1.5 text-[12px] capitalize text-txt2 transition-colors hover:border-accent hover:text-txt"
            >
              <Plus className="h-3 w-3" /> {k}
            </button>
          ))}
          <button
            onClick={() => setStoreOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2.5 py-1.5 text-[12px] font-medium text-txt2 transition-colors hover:border-accent hover:text-txt"
          >
            <Boxes className="h-3 w-3 text-accent" /> Widget store
          </button>
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

      {storeOpen && (
        <WidgetStore
          spaceId={spaceId}
          onClose={() => setStoreOpen(false)}
          onAdd={(widget, config) => {
            setSteps((prev) => [...prev, { kind: "widget", widget, ...(config ? { config } : {}) }]);
            setStoreOpen(false);
            toast("Widget added — scroll down to your new step");
          }}
        />
      )}

      <AssistPanel
        lessonId={lessonId}
        manifest={manifest}
        steps={steps}
        onApply={applyAiEdit}
        onUndo={undoAiEdit}
        canUndo={canUndo}
      />
    </div>
  );
}

/* The in-editor AI co-author. The teacher asks for a change or a question; the
 * AI either edits the whole lesson (applied for review — never auto-saved, with a
 * one-step Undo) or answers. Premium; degrades gracefully if no key resolves. */
interface AssistMsg {
  role: "user" | "ai";
  text: string;
  edited?: boolean;
}
function AssistPanel({
  lessonId,
  manifest,
  steps,
  onApply,
  onUndo,
  canUndo,
}: {
  lessonId: string;
  manifest: LessonManifest;
  steps: LessonStep[];
  onApply: (lesson: { manifest: LessonManifest; steps: LessonStep[] }) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<AssistMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/lab/lessons/${lessonId}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: q, manifest, steps }),
      });
      const j = await res.json().catch(() => null);
      const d = j?.data;
      if (d?.mode === "edit" && d.lesson) {
        onApply(d.lesson as { manifest: LessonManifest; steps: LessonStep[] });
        setMsgs((m) => [...m, { role: "ai", text: `✏️ ${d.summary ?? "Updated the lesson."} — review it in Preview, then Save. (Undo below)`, edited: true }]);
      } else if (d?.mode === "answer") {
        setMsgs((m) => [...m, { role: "ai", text: d.text as string }]);
      } else {
        setMsgs((m) => [...m, { role: "ai", text: j?.error?.message ?? "I couldn't do that — try rephrasing." }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "Something went wrong — try again." }]);
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-panel px-4 py-2.5 text-[13px] font-semibold text-accent shadow-card transition hover:bg-accent hover:text-accent-ink"
      >
        <Wand2 className="h-4 w-4" /> AI co-author
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[480px] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-card">
      <div className="flex items-center gap-2 border-b border-border bg-bg2 px-3.5 py-2.5">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="text-[13px] font-semibold text-txt">AI co-author</span>
        {canUndo && (
          <button
            onClick={onUndo}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border2 bg-panel2 px-2 py-1 text-[11px] text-txt2 transition-colors hover:border-accent hover:text-txt"
          >
            <Undo2 className="h-3 w-3" /> Undo edit
          </button>
        )}
        <button onClick={() => setOpen(false)} aria-label="Close" className={cn("text-txt3 transition-colors hover:text-txt", canUndo ? "" : "ml-auto")}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="scroll-area flex-1 space-y-3 overflow-auto p-3.5">
        {msgs.length === 0 && (
          <div className="text-[12.5px] leading-relaxed text-txt3">
            Ask me to build or change this lesson — like
            <span className="text-txt2"> “add a quiz about overfitting”</span>,
            <span className="text-txt2"> “make Part 2 simpler”</span>, or
            <span className="text-txt2"> “add a sorting game at the start”</span>. I can answer questions too.
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[90%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
              m.role === "user" ? "ml-auto bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-txt" : "bg-panel2 text-txt2",
              m.edited && "border border-[color-mix(in_srgb,var(--accent)_40%,transparent)]",
            )}
          >
            {m.role === "ai" ? <Markdown content={m.text} /> : m.text}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-[12px] text-txt3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> working…
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t border-border p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the co-author…"
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
        : step.kind === "widget"
          ? `Widget: ${step.widget}`
          : step.prompt;

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
              {WIDGET_CATALOG.find((w) => w.id === step.widget)?.desc && (
                <p className="text-[11px] leading-relaxed text-txt3">{WIDGET_CATALOG.find((w) => w.id === step.widget)?.desc}</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {WIDGET_PHASES[step.widget] && (
                  <Field label="Phase">
                    <select
                      value={(step.config?.phase as string) ?? ""}
                      onChange={(e) => onChange({ ...step, config: { ...(step.config ?? {}), phase: e.target.value || undefined } })}
                      className={inputCls}
                    >
                      <option value="">(default)</option>
                      {WIDGET_PHASES[step.widget].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Dataset (optional)">
                  <select
                    value={(step.config?.dataset as string) ?? ""}
                    onChange={(e) => onChange({ ...step, config: { ...(step.config ?? {}), dataset: e.target.value || undefined } })}
                    className={inputCls}
                  >
                    <option value="">(default)</option>
                    {DATASET_IDS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Intro text (optional)">
                <textarea
                  value={step.body ?? ""}
                  onChange={(e) => onChange({ ...step, body: e.target.value })}
                  rows={2}
                  className={cn(inputCls, "resize-y font-sans")}
                />
              </Field>
              <Field label="“You'll…” framing (optional)">
                <input value={step.youWillDo ?? ""} onChange={(e) => onChange({ ...step, youWillDo: e.target.value || undefined })} className={inputCls} placeholder="drag the line to split the dots" />
              </Field>
            </>
          )}

          {step.kind === "predict" && (
            <>
              <Field label="Prompt (the guess to make)">
                <input value={step.prompt} onChange={(e) => onChange({ ...step, prompt: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Choices (no single right answer — it's a guess)">
                <ChoiceList choices={step.choices} onChange={(choices) => onChange({ ...step, choices })} />
              </Field>
              <Field label="After they pick (optional)">
                <input value={step.afterPick ?? ""} onChange={(e) => onChange({ ...step, afterPick: e.target.value || undefined })} className={inputCls} placeholder="Let's find out. →" />
              </Field>
              <Field label="“You'll…” framing (optional)">
                <input value={step.youWillDo ?? ""} onChange={(e) => onChange({ ...step, youWillDo: e.target.value || undefined })} className={inputCls} placeholder="make a prediction" />
              </Field>
            </>
          )}

          {step.kind === "reflect" && (
            <>
              <Field label="Prompt (explain-it-back, open-ended)">
                <input value={step.prompt} onChange={(e) => onChange({ ...step, prompt: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Placeholder (sentence starter, optional)">
                <input value={step.placeholder ?? ""} onChange={(e) => onChange({ ...step, placeholder: e.target.value || undefined })} className={inputCls} placeholder="It works like…" />
              </Field>
              <div className="rounded-md border border-border2 bg-panel2 p-2.5">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-txt3">Recall check (gates Next)</div>
                <Field label="Question">
                  <input value={step.recall.question} onChange={(e) => onChange({ ...step, recall: { ...step.recall, question: e.target.value } })} className={inputCls} />
                </Field>
                <Field label="Choices (pick the correct one)">
                  <ChoiceList
                    choices={step.recall.choices}
                    answer={step.recall.answer}
                    onChange={(choices, answer) => onChange({ ...step, recall: { ...step.recall, choices, answer: answer ?? step.recall.answer } })}
                    name={`recall-${index}`}
                  />
                </Field>
                <Field label="Explanation (shown after answering)">
                  <input value={step.recall.explain ?? ""} onChange={(e) => onChange({ ...step, recall: { ...step.recall, explain: e.target.value || undefined } })} className={inputCls} />
                </Field>
              </div>
              <Field label="“You'll…” framing (optional)">
                <input value={step.youWillDo ?? ""} onChange={(e) => onChange({ ...step, youWillDo: e.target.value || undefined })} className={inputCls} placeholder="explain it back" />
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* A reusable choices list. With `answer`/`name` it shows a correct-answer radio
 * (quiz/recall); without, it's a plain list (predict). */
function ChoiceList({
  choices,
  answer,
  onChange,
  name,
}: {
  choices: string[];
  answer?: number;
  onChange: (choices: string[], answer?: number) => void;
  name?: string;
}) {
  const withAnswer = answer !== undefined && name !== undefined;
  return (
    <div className="space-y-1.5">
      {choices.map((c, ci) => (
        <div key={ci} className="flex items-center gap-2">
          {withAnswer && (
            <input type="radio" name={name} checked={answer === ci} onChange={() => onChange(choices, ci)} />
          )}
          <input
            value={c}
            onChange={(e) => onChange(choices.map((x, xi) => (xi === ci ? e.target.value : x)), answer)}
            className={cn(inputCls, "flex-1")}
          />
          <button
            onClick={() => {
              if (choices.length <= 2) return;
              const next = choices.filter((_, xi) => xi !== ci);
              onChange(next, withAnswer ? Math.min(answer, next.length - 1) : answer);
            }}
            disabled={choices.length <= 2}
            className="text-txt3 hover:text-bad disabled:opacity-30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {choices.length < 6 && (
        <button
          onClick={() => onChange([...choices, "New choice"], answer)}
          className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
        >
          <Plus className="h-3 w-3" /> add choice
        </button>
      )}
    </div>
  );
}

function ObjectivesEditor({ objectives, onChange }: { objectives: string[]; onChange: (o: string[]) => void }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-txt3">Objectives (intro card)</span>
      <div className="space-y-1.5">
        {objectives.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={o}
              onChange={(e) => onChange(objectives.map((x, xi) => (xi === i ? e.target.value : x)))}
              className={cn(inputCls, "flex-1")}
              placeholder="What they'll get…"
            />
            <button onClick={() => onChange(objectives.filter((_, xi) => xi !== i))} className="text-txt3 hover:text-bad">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {objectives.length < 8 && (
          <button onClick={() => onChange([...objectives, ""])} className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
            <Plus className="h-3 w-3" /> add objective
          </button>
        )}
      </div>
    </div>
  );
}

function GlossaryEditor({ glossary, onChange }: { glossary: GlossaryTerm[]; onChange: (g: GlossaryTerm[]) => void }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-txt3">Glossary (“Words” panel)</span>
      <div className="space-y-1.5">
        {glossary.map((g, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={g.term}
              onChange={(e) => onChange(glossary.map((x, xi) => (xi === i ? { ...x, term: e.target.value } : x)))}
              className={cn(inputCls, "w-28 shrink-0")}
              placeholder="Term"
            />
            <input
              value={g.def}
              onChange={(e) => onChange(glossary.map((x, xi) => (xi === i ? { ...x, def: e.target.value } : x)))}
              className={cn(inputCls, "flex-1")}
              placeholder="Kid-friendly meaning"
            />
            <button onClick={() => onChange(glossary.filter((_, xi) => xi !== i))} className="text-txt3 hover:text-bad">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {glossary.length < 30 && (
          <button onClick={() => onChange([...glossary, { term: "", def: "" }])} className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
            <Plus className="h-3 w-3" /> add word
          </button>
        )}
      </div>
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
