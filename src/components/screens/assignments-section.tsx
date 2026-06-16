/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount effects set state from async loads; they behave correctly */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ClipboardList, GraduationCap, Loader2, Plus, Brain } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface CatalogLesson {
  id: string;
  title: string;
  group: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  dueAt: string | null;
  hasStarter: boolean;
  lessonId: string | null;
  createdAt: string;
  // instructor
  startedCount?: number;
  submittedCount?: number;
  // student
  mine?: { status: string; workspaceId: string | null; grade: string | null } | null;
}

interface OwnWorkspace {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<string, { label: string; tone: "accent" | "neutral" | "green" }> = {
  in_progress: { label: "in progress", tone: "neutral" },
  submitted: { label: "submitted", tone: "accent" },
  reviewed: { label: "reviewed", tone: "green" },
};

function dueLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  return `due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Assignment list inside a classroom Space's detail panel. */
export function AssignmentsSection({
  spaceId,
  isOwner,
  onUpgradeNeeded,
}: {
  spaceId: string;
  isOwner: boolean;
  /** Called with the server's message when the free assignment cap is hit. */
  onUpgradeNeeded?: (message: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Create form
  const [kind, setKind] = useState<"project" | "lesson">("project");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [starterId, setStarterId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [ownWorkspaces, setOwnWorkspaces] = useState<OwnWorkspace[] | null>(null);
  const [lessons, setLessons] = useState<CatalogLesson[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/assignments`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setRows(json.data.assignments as AssignmentRow[]);
        setError(null);
      } else {
        setError(json?.error?.message ?? "Couldn't load assignments.");
      }
    } catch {
      setError("Couldn't load assignments.");
    }
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The instructor's own workspaces feed the starter <select>, loaded when
  // the dialog first opens.
  useEffect(() => {
    if (!dialogOpen || ownWorkspaces !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspaces", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.ok) {
          setOwnWorkspaces(
            (json.data.workspaces as { id: string; name: string }[]).map((w) => ({ id: w.id, name: w.name })),
          );
        } else if (!cancelled) {
          setOwnWorkspaces([]);
        }
      } catch {
        if (!cancelled) setOwnWorkspaces([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, ownWorkspaces]);

  // The teacher's lessons + bundled starters feed the lesson picker.
  useEffect(() => {
    if (!dialogOpen || lessons !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/lab/lessons/catalog?spaceId=${spaceId}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!cancelled) setLessons(res.ok && json?.ok ? (json.data.lessons as CatalogLesson[]) : []);
      } catch {
        if (!cancelled) setLessons([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, lessons, spaceId]);

  const lessonMode = kind === "lesson";
  const canCreate = title.trim() && (lessonMode ? Boolean(lessonId) : Boolean(instructions.trim()));

  async function create() {
    if (creating || !canCreate) return;
    setCreating(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          instructions: lessonMode ? instructions.trim() || "Complete this lesson — finish all the steps and quizzes." : instructions,
          ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
          ...(lessonMode ? { lessonId } : starterId ? { starterWorkspaceId: starterId } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setDialogOpen(false);
        setTitle("");
        setInstructions("");
        setDueAt("");
        setStarterId("");
        setLessonId("");
        setKind("project");
        toast("Assignment created");
        await load();
      } else if (json?.error?.code === "UPGRADE_REQUIRED") {
        setDialogOpen(false);
        onUpgradeNeeded?.(json.error.message as string);
      } else {
        setFormError(json?.error?.message ?? "Couldn't create the assignment.");
      }
    } catch {
      setFormError("Couldn't create the assignment.");
    }
    setCreating(false);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardList className="h-4 w-4 text-txt3" /> Assignments
        </h3>
        {isOwner && (
          <div className="flex gap-1.5">
            <Button variant="ghost" onClick={() => router.push(`/space/gradebook?s=${spaceId}`)}>
              <GraduationCap className="h-3.5 w-3.5" /> Gradebook
            </Button>
            <Button variant="ghost" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New assignment
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <Card className="p-5 text-center text-xs text-bad">
          {error}{" "}
          <button className="cursor-pointer underline" onClick={() => void load()}>
            Retry
          </button>
        </Card>
      ) : rows === null ? (
        <Card className="grid min-h-[72px] place-items-center p-4 text-xs text-txt3">
          <span className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
          </span>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-5 text-center text-xs text-txt3">
          {isOwner
            ? "No assignments yet. Create one — pick one of your workspaces as the starter code."
            : "No assignments yet. They'll show up here when your instructor posts one."}
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => {
            const status = a.mine ? STATUS_LABEL[a.mine.status] : null;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/space/assignments/${a.id}?s=${spaceId}`)}
                  className="flex w-full items-center gap-3 rounded-card border border-border bg-panel px-4 py-3 text-left transition-colors hover:border-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-txt">
                      {a.lessonId && <Brain className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Lesson" />}
                      <span className="truncate">{a.title}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-txt3">
                      {a.dueAt && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" /> {dueLabel(a.dueAt)}
                        </span>
                      )}
                      {isOwner && (
                        <span>
                          {a.submittedCount ?? 0} submitted · {a.startedCount ?? 0} started
                        </span>
                      )}
                    </span>
                  </span>
                  {!isOwner &&
                    (status ? (
                      <Pill tone={status.tone}>{status.label}</Pill>
                    ) : (
                      <Pill tone="neutral">not started</Pill>
                    ))}
                  {!isOwner && a.mine?.grade && <Pill tone="green">{a.mine.grade}</Pill>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader
            title="New assignment"
            description="Assign a coding project, or an AI Academy module that auto-grades from its quiz."
          />
          <form
            className="space-y-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Segmented
              options={[
                { value: "project", label: "Project" },
                { value: "lesson", label: "Lesson" },
              ]}
              value={kind}
              onChange={(v) => setKind(v as "project" | "lesson")}
              aria-label="Assignment type"
              className="self-start"
            />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lessonMode ? "Title — e.g. Homework: Decision trees" : "Title — e.g. Build a todo app"}
              aria-label="Assignment title"
              autoFocus
            />
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={lessonMode ? "Optional note for students…" : "Instructions (markdown) — what to build, what gets assessed…"}
              aria-label="Instructions"
              rows={lessonMode ? 2 : 6}
            />
            <div className="flex flex-wrap gap-2">
              <label className="flex flex-1 items-center gap-2 text-xs text-txt3">
                Due
                <Input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  aria-label="Due date"
                  className="text-[12px]"
                />
              </label>
              {lessonMode ? (
                <label className="flex flex-1 items-center gap-2 text-xs text-txt3">
                  Lesson
                  <select
                    value={lessonId}
                    onChange={(e) => {
                      setLessonId(e.target.value);
                      const l = (lessons ?? []).find((x) => x.id === e.target.value);
                      if (l && !title.trim()) setTitle(l.title);
                    }}
                    aria-label="Lesson"
                    className="h-9 w-full rounded-lg border border-border2 bg-panel2 px-2 text-[12px] text-txt outline-none focus:border-accent"
                  >
                    <option value="">Choose a lesson…</option>
                    {lessons === null ? (
                      <option disabled>loading…</option>
                    ) : (
                      ["Your lessons", "Starter lessons"].map((grp) => {
                        const items = lessons.filter((l) => l.group === grp);
                        return items.length ? (
                          <optgroup key={grp} label={grp}>
                            {items.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.title}
                              </option>
                            ))}
                          </optgroup>
                        ) : null;
                      })
                    )}
                  </select>
                </label>
              ) : (
                <label className="flex flex-1 items-center gap-2 text-xs text-txt3">
                  Starter
                  <select
                    value={starterId}
                    onChange={(e) => setStarterId(e.target.value)}
                    aria-label="Starter workspace"
                    className="h-9 w-full rounded-lg border border-border2 bg-panel2 px-2 text-[12px] text-txt outline-none focus:border-accent"
                  >
                    <option value="">None (blank workspace)</option>
                    {(ownWorkspaces ?? []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {formError && <p className="text-xs text-warn">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !canCreate}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
