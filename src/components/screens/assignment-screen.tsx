/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount effects set state from async loads */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  ClipboardList,
  Loader2,
  Send,
  Undo2,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface Mine {
  id: string;
  status: string;
  workspaceId: string | null;
  submittedAt: string | null;
  grade: string | null;
  feedback: string | null;
}

interface RosterRow {
  userId: string;
  name: string;
  image: string | null;
  submissionId: string | null;
  status: string; // not_started | in_progress | submitted | reviewed
  workspaceId: string | null;
  submittedAt: string | null;
  grade: string | null;
  feedback: string | null;
  aiReview: string | null;
}

interface Detail {
  id: string;
  spaceId: string;
  spaceName: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  isOwner: boolean;
  mine?: Mine | null;
  roster?: RosterRow[];
}

const STATUS_PILL: Record<string, { label: string; tone: "neutral" | "accent" | "green" }> = {
  not_started: { label: "not started", tone: "neutral" },
  in_progress: { label: "in progress", tone: "neutral" },
  submitted: { label: "submitted", tone: "accent" },
  reviewed: { label: "reviewed", tone: "green" },
};

export function AssignmentScreen({ spaceId, assignmentId }: { spaceId: string; assignmentId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/assignments/${assignmentId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setDetail(json.data as Detail);
        setError(null);
      } else {
        setError(json?.error?.message ?? "Couldn't load this assignment.");
      }
    } catch {
      setError("Couldn't load this assignment.");
    }
  }, [spaceId, assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="pad-screen">
        <Card className="mx-auto mt-6 max-w-[760px] p-8 text-center text-sm text-bad">
          {error}{" "}
          <button className="cursor-pointer underline" onClick={() => void load()}>
            Retry
          </button>
        </Card>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="pad-screen">
        <div className="mx-auto grid min-h-[40vh] max-w-[980px] place-items-center text-sm text-txt3">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> loading…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pad-screen">
      <div className="mx-auto max-w-[980px]">
        <button
          type="button"
          onClick={() => router.push(`/space?s=${spaceId}`)}
          className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-txt3 transition-colors hover:text-txt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {detail.spaceName}
        </button>

        <div className="mb-1 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-txt3" />
          <h1 className="text-[20px] font-bold tracking-tight">{detail.title}</h1>
          {detail.dueAt && (
            <Pill tone="neutral">
              <CalendarClock className="h-3 w-3" />{" "}
              {new Date(detail.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </Pill>
          )}
        </div>

        <Card className="mt-4 p-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-txt3">Instructions</h2>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-txt2">{detail.instructions}</p>
        </Card>

        {detail.isOwner ? (
          <InstructorPanel detail={detail} spaceId={spaceId} assignmentId={assignmentId} onChanged={load} />
        ) : (
          <StudentPanel detail={detail} spaceId={spaceId} assignmentId={assignmentId} onChanged={load} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------- student -------------------------------- */

function StudentPanel({
  detail,
  spaceId,
  assignmentId,
  onChanged,
}: {
  detail: Detail;
  spaceId: string;
  assignmentId: string;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const mine = detail.mine ?? null;

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/assignments/${assignmentId}/start`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        router.push(`/editor/${json.data.workspaceId}`);
        return;
      }
      toast(json?.error?.message ?? "Couldn't start the assignment.");
    } catch {
      toast("Couldn't start the assignment.");
    }
    setBusy(false);
  }

  async function setSubmitState(action: "submit" | "unsubmit") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/assignments/${assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        toast(action === "submit" ? "Submitted" : "Back in progress");
        await onChanged();
      } else {
        toast(json?.error?.message ?? "Couldn't update the submission.");
      }
    } catch {
      toast("Couldn't update the submission.");
    }
    setBusy(false);
  }

  const status = mine ? STATUS_PILL[mine.status] : null;

  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Your work</h2>
        {status && <Pill tone={status.tone}>{status.label}</Pill>}
        {mine?.submittedAt && (
          <span className="text-[11px] text-txt3">submitted {timeAgo(mine.submittedAt)}</span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!mine ? (
            <Button onClick={() => void start()} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Start assignment
            </Button>
          ) : (
            <>
              {mine.workspaceId && (
                <Button variant="ghost" onClick={() => router.push(`/editor/${mine.workspaceId}`)}>
                  Open workspace
                </Button>
              )}
              {mine.status === "in_progress" && (
                <Button onClick={() => void setSubmitState("submit")} disabled={busy}>
                  <Send className="h-3.5 w-3.5" /> Submit
                </Button>
              )}
              {mine.status === "submitted" && (
                <Button variant="ghost" onClick={() => void setSubmitState("unsubmit")} disabled={busy}>
                  <Undo2 className="h-3.5 w-3.5" /> Keep working
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {mine?.status === "reviewed" && (
        <div className="mt-4 rounded-card border border-border bg-panel2 p-4">
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-txt3">Feedback</h3>
            {mine.grade && <Pill tone="green">{mine.grade}</Pill>}
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-txt2">
            {mine.feedback || "Reviewed — no written feedback."}
          </p>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------- instructor ------------------------------- */

function InstructorPanel({
  detail,
  spaceId,
  assignmentId,
  onChanged,
}: {
  detail: Detail;
  spaceId: string;
  assignmentId: string;
  onChanged: () => Promise<void>;
}) {
  const roster = detail.roster ?? [];
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Submissions</h2>
        <span className="text-[11px] text-txt3">
          {roster.filter((r) => r.status === "submitted" || r.status === "reviewed").length} of {roster.length}{" "}
          submitted
        </span>
      </div>

      {roster.length === 0 ? (
        <Card className="p-6 text-center text-xs text-txt3">
          No students in this classroom yet — share the invite link from the space page.
        </Card>
      ) : (
        <ul className="space-y-2">
          {roster.map((r) => (
            <GradeRow
              key={r.userId}
              row={r}
              spaceId={spaceId}
              assignmentId={assignmentId}
              open={openUserId === r.userId}
              onToggle={() => setOpenUserId((cur) => (cur === r.userId ? null : r.userId))}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GradeRow({
  row,
  spaceId,
  assignmentId,
  open,
  onToggle,
  onChanged,
}: {
  row: RosterRow;
  spaceId: string;
  assignmentId: string;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [grade, setGrade] = useState(row.grade ?? "");
  const [aiReview, setAiReview] = useState(row.aiReview);
  const status = STATUS_PILL[row.status] ?? STATUS_PILL.not_started;
  const gradable = Boolean(row.submissionId);

  async function save(markReviewed: boolean) {
    if (busy || !row.submissionId) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/spaces/${spaceId}/assignments/${assignmentId}/submissions/${row.submissionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback, grade, ...(markReviewed ? { markReviewed: true } : {}) }),
        },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        toast(markReviewed ? "Marked reviewed — the student can see the feedback now" : "Saved");
        await onChanged();
      } else {
        toast(json?.error?.message ?? "Couldn't save.");
      }
    } catch {
      toast("Couldn't save.");
    }
    setBusy(false);
  }

  async function runAiReview() {
    if (reviewing || !row.submissionId) return;
    setReviewing(true);
    try {
      const res = await fetch(
        `/api/spaces/${spaceId}/assignments/${assignmentId}/submissions/${row.submissionId}/ai-review`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setAiReview(json.data.text as string);
        toast("AI review ready");
      } else {
        toast(json?.error?.message ?? "AI review failed.");
      }
    } catch {
      toast("AI review failed.");
    }
    setReviewing(false);
  }

  return (
    <li>
      <Card className={cn("transition-colors", open && "border-accent/50")}>
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
          <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-panel2 text-[10px] font-semibold text-txt2">
            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.image} alt="" className="h-full w-full object-cover" />
            ) : (
              row.name.slice(0, 2).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-txt">{row.name}</span>
            {row.submittedAt && (
              <span className="block text-[11px] text-txt3">submitted {timeAgo(row.submittedAt)}</span>
            )}
          </span>
          {row.grade && <Pill tone="green">{row.grade}</Pill>}
          <Pill tone={status.tone}>{status.label}</Pill>
        </button>

        {open && gradable && (
          <div className="space-y-3 border-t border-border p-4">
            <div className="flex flex-wrap gap-2">
              {row.workspaceId && (
                <Button variant="ghost" onClick={() => router.push(`/editor/${row.workspaceId}`)}>
                  Open submission
                </Button>
              )}
              <Button variant="ghost" onClick={() => void runAiReview()} disabled={reviewing}>
                {reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                AI review
              </Button>
            </div>

            {aiReview && (
              <div className="rounded-card border border-border bg-panel2 p-3">
                <h4 className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-txt3">
                  <Bot className="h-3 w-3" /> AI review (visible to you only)
                </h4>
                <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-txt2">
                  {aiReview}
                </p>
              </div>
            )}

            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Feedback for the student…"
              aria-label="Feedback"
              rows={4}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Grade — e.g. 92/100"
                aria-label="Grade"
                className="max-w-[160px] text-[12.5px]"
              />
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" onClick={() => void save(false)} disabled={busy}>
                  Save draft
                </Button>
                <Button onClick={() => void save(true)} disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Mark reviewed
                </Button>
              </div>
            </div>
          </div>
        )}

        {open && !gradable && (
          <div className="border-t border-border p-4 text-xs text-txt3">
            This student hasn&apos;t started the assignment yet.
          </div>
        )}
      </Card>
    </li>
  );
}
