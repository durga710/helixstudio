/* eslint-disable react-hooks/set-state-in-effect -- ported GCODE studio code; its fetch-on-mount/poll effects predate this rule and behave correctly */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Sparkles,
  Wrench,
  ExternalLink,
  Globe,
  UserRound,
  CreditCard,
  Newspaper,
  Clock,
  GitCompare,
  Lock,
  Check,
  PencilLine,
  Map,
  CircleCheck,
  TriangleAlert,
  ShieldCheck,
  ChevronDown,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { warmupSteps } from "@/lib/warmup-steps";
import { readCache, writeCache } from "@/lib/client-cache";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { WorkspaceMeta } from "@/components/studio/studio";
import { ModelPicker } from "@/components/studio/model-picker";

interface Action {
  tool: string;
  label: string;
  log?: string; // present on verify markers
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
}

interface TaskChanges {
  written: string[];
  deleted: string[];
}
interface BgTask {
  id: string;
  prompt: string;
  status: "queued" | "running" | "done" | "error";
  resultText?: string | null;
  actions?: Action[] | null;
  changes?: TaskChanges | null;
  error?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}

/** Compact relative time ("now", "3m", "2h", "5d") from an ISO/date string. */
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

const STARTERS = [
  { icon: Globe, title: "Waitlist landing page", prompt: "A waitlist landing page with a bold hero and email signup form" },
  { icon: UserRound, title: "Portfolio site", prompt: "A personal portfolio site with an about section and project cards" },
  { icon: CreditCard, title: "Pricing page", prompt: "A pricing page with three tiers and a featured plan" },
  { icon: Newspaper, title: "Mini blog", prompt: "A simple blog with three sample posts and a clean reading layout" },
] as const;

/** A curation question returned by the intake engine (/api/.../intake). */
interface IntakeQ {
  key: string;
  text: string;
  options?: string[];
}

/** Older turns may have a model-only build brief baked into the stored user
 * message; show only the real request. New turns send the brief separately so
 * it's never persisted (see the chat route's `brief` field). */
function stripBrief(content: string): string {
  const marker = "\n\nRequest: ";
  const i = content.lastIndexOf(marker);
  return i >= 0 ? content.slice(i + marker.length) : content;
}

/** Render assistant text with clickable links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 break-all text-accent underline underline-offset-2 hover:brightness-110"
          >
            {part.replace(/^https:\/\/(www\.)?/, "").slice(0, 60)}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * The Helix chatbox. Sends one message per turn to the workspace chat route;
 * the response's change manifest flows up via onChanges so the workspace
 * panel refreshes. History is hydrated from the server (persisted messages).
 */
export function ChatPanel({
  workspace,
  onChanges,
  isGuest,
  isOwner = true,
}: {
  workspace: WorkspaceMeta;
  onChanges: (written: string[], deleted: string[]) => void;
  isGuest?: boolean;
  isOwner?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[] | null>(null); // null = loading history
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"plan" | "build">("build");
  // Auto-verify build turns in the sandbox. ON by default (Plan→Build→Verify
  // is the standard flow now); the toggle lets you turn it off, and the
  // per-message "Verify" button works regardless.
  const [verifyOn, setVerifyOn] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [openLog, setOpenLog] = useState<number | null>(null); // message index with expanded log
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  // The turn's activity as a live ticking checklist (the agent's REAL work —
  // reading, writing, verifying), so a big "create infrastructure" task reads
  // as genuine progress instead of one cycling loader line.
  const [worklog, setWorklog] = useState<string[]>([]);
  // Live assistant reply, streamed token-by-token (replaced by the real message
  // on the final event).
  const [streaming, setStreaming] = useState("");
  // null until the first chat turn reports it; counts down to 0.
  const [guestRemaining, setGuestRemaining] = useState<number | null>(null);
  const [tasks, setTasks] = useState<BgTask[]>([]);
  const [queuingTask, setQueuingTask] = useState(false);
  const guestBlocked = isGuest && guestRemaining === 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Flips true on the turn's first real activity event, so the warm-up prelude
  // knows to stop and hand off to the agent's actual work.
  const realActivityStarted = useRef(false);
  // True while THIS tab is running a turn, so the resume poller stands down.
  const localSend = useRef(false);

  // Conversational new-project intake (scratch only): the curation ENGINE
  // (rules + a tiny gated AI call) drives this — idle → ask the idea, thinking →
  // engine runs, asking → dynamic questions, done → real build kicks off.
  const [intakePhase, setIntakePhase] = useState<"idle" | "thinking" | "asking" | "done">("idle");
  const [intakeIdea, setIntakeIdea] = useState("");
  const [intakeQuestions, setIntakeQuestions] = useState<IntakeQ[]>([]);
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});
  const [intakeQIndex, setIntakeQIndex] = useState(0);

  // Plan/Build is easy to lose track of, so a user toggle pops a brief toast
  // (auto-dismisses) on top of the always-on plan-mode banner.
  const [modeToast, setModeToast] = useState<null | "plan" | "build">(null);
  const modeToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function changeMode(next: "plan" | "build") {
    setMode(next);
    setModeToast(next);
    if (modeToastTimer.current) clearTimeout(modeToastTimer.current);
    modeToastTimer.current = setTimeout(() => setModeToast(null), 2000);
  }

  useEffect(() => {
    let cancelled = false;
    // Returning to a workspace paints the last-known conversation instantly;
    // the fetch below replaces it with the fresh history.
    const cached = readCache<Msg[]>(`ws:${workspace.id}:messages`);
    if (cached) setMessages(cached);
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.ok) {
          const fresh = (
            json.data.messages as { role: "user" | "assistant"; content: string; actions: Action[] | null }[]
          ).map((m) => ({
                  role: m.role,
                  content: m.role === "user" ? stripBrief(m.content) : m.content,
                  actions: m.actions ?? undefined,
                }));
          setMessages(fresh);
          writeCache(`ws:${workspace.id}:messages`, fresh);
        } else if (!cached) {
          setMessages([]);
        }
      } catch {
        if (!cancelled && !cached) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Keep the cache current as turns land, so navigating away and back
  // repaints the full conversation without a flash.
  useEffect(() => {
    if (messages) writeCache(`ws:${workspace.id}:messages`, messages);
  }, [messages, workspace.id]);

  useEffect(() => {
    if (!busy) {
      setActivity(null);
      setWorklog([]);
    }
  }, [busy]);

  /* ----------------------------- background tasks ------------------------- */

  // Load any persisted background tasks once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/tasks`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.ok) setTasks(json.data.tasks ?? []);
      } catch {
        // no tasks yet, or guests — fine
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  // Poll for task updates only while something is in flight; stop when all terminal.
  const tasksPending = tasks.some((t) => t.status === "queued" || t.status === "running");
  useEffect(() => {
    if (!tasksPending) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/tasks`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.ok) setTasks(json.data.tasks ?? []);
      } catch {
        // keep last snapshot; next tick retries
      }
    };
    const t = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [tasksPending, workspace.id]);

  async function queueTask(text: string) {
    const content = text.trim();
    if (!content || queuingTask || messages === null) return;
    if (isGuest) {
      setMessages((m) => [
        ...(m ?? []),
        { role: "assistant", content: "Sign in to queue background tasks." },
      ]);
      return;
    }
    setQueuingTask(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMessages((m) => [
          ...(m ?? []),
          { role: "assistant", content: json?.error?.message ?? "Couldn't queue that task." },
        ]);
      } else {
        setInput("");
        // Optimistically show the queued task; the poll fills in the rest.
        setTasks((ts) => [
          {
            id: json.data.id,
            prompt: content,
            status: json.data.status ?? "queued",
            createdAt: new Date().toISOString(),
          },
          ...ts,
        ]);
      }
    } catch {
      setMessages((m) => [...(m ?? []), { role: "assistant", content: "Network error. Try again." }]);
    }
    setQueuingTask(false);
  }

  async function send(
    text: string,
    sendMode: "plan" | "build" = mode,
    sendVerify: boolean = verifyOn,
    brief?: string,
  ) {
    const content = text.trim();
    if (!content || busy || messages === null) return;
    localSend.current = true;
    setMessages((m) => [...(m ?? []), { role: "user", content }]);
    setInput("");
    setBusy(true);
    setStreaming("");
    setWorklog([]);

    // Intent-aware warm-up: fill the latency before the first real activity
    // with honest, process-true steps (a question never shows "scaffolding").
    // Stops the instant the agent's real work starts streaming in.
    realActivityStarted.current = false;
    void (async () => {
      for (const step of warmupSteps(content)) {
        if (realActivityStarted.current) break;
        setWorklog((w) => (realActivityStarted.current ? w : [...w, step]));
        await new Promise((r) => setTimeout(r, 360 + Math.floor(Math.random() * 560)));
      }
    })();

    // Replicates the old success path: append the assistant turn, update the
    // guest counter, and surface any file changes to the workspace panel.
    const handleFinal = (data: {
      text?: string;
      actions?: Action[];
      changes?: TaskChanges;
      guestRemaining?: number;
    }) => {
      setMessages((m) => [
        ...(m ?? []),
        { role: "assistant", content: data.text ?? "", actions: data.actions },
      ]);
      if (typeof data.guestRemaining === "number") setGuestRemaining(data.guestRemaining);
      const ch = data.changes;
      if (ch && (ch.written.length > 0 || ch.deleted.length > 0)) onChanges(ch.written, ch.deleted);
    };

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, mode: sendMode, verify: sendVerify, brief: brief || undefined }),
      });

      const isNdjson = res.headers.get("content-type")?.includes("application/x-ndjson");

      if (res.body && isNdjson) {
        // Stream NDJSON: each line is an {type:"activity"|"final"|"error"} event.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const consume = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          let evt: { type?: string; [k: string]: unknown };
          try {
            evt = JSON.parse(trimmed);
          } catch {
            return; // ignore malformed partials
          }
          if (evt.type === "activity") {
            const label = (evt.label as string) ?? null;
            // Real work has begun — let the warm-up prelude bow out.
            realActivityStarted.current = true;
            setActivity(label);
            if (label) setWorklog((w) => [...w, label]);
          } else if (evt.type === "delta") {
            realActivityStarted.current = true; // the reply is streaming — stop warm-up
            setStreaming((s) => s + ((evt.text as string) ?? ""));
          } else if (evt.type === "final") {
            setStreaming("");
            handleFinal(evt as Parameters<typeof handleFinal>[0]);
          } else if (evt.type === "error") {
            setStreaming("");
            if (evt.code === "GUEST_LIMIT") setGuestRemaining(0);
            setMessages((m) => [
              ...(m ?? []),
              { role: "assistant", content: (evt.message as string) ?? "Something went wrong." },
            ]);
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            consume(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
          }
        }
        if (buffer) consume(buffer); // trailing line without newline
      } else {
        // Fallback for an older, non-streaming server.
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          if (json?.error?.code === "GUEST_LIMIT") setGuestRemaining(0);
          setMessages((m) => [
            ...(m ?? []),
            { role: "assistant", content: json?.error?.message ?? "Something went wrong." },
          ]);
        } else {
          handleFinal(json.data);
        }
      }
    } catch {
      setMessages((m) => [...(m ?? []), { role: "assistant", content: "Network error. Try again." }]);
    }
    setStreaming("");
    setBusy(false);
    localSend.current = false;
  }

  /* --------------------- new-project intake ----------------------- */

  // Runs only for a brand-new, empty scratch workspace.
  const intakeActive =
    messages !== null && messages.length === 0 && !busy && workspace.mode === "SCRATCH" && intakePhase !== "done";

  // Hand off to the real build: the idea is the visible first message; the
  // engine's curated brief rides along as a MODEL-ONLY hint (never shown).
  function launchIntake(idea: string, brief: string) {
    setIntakePhase("done");
    void send(idea, mode, verifyOn, brief || undefined);
  }

  // Call the curation engine. Round 1 = just the idea; round 2 adds answers.
  // Never blocks: any failure just builds from the idea directly.
  async function runEngine(idea: string, answers?: Record<string, string>) {
    setIntakePhase("thinking");
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, ...(answers ? { answers } : {}) }),
      });
      const json = await res.json().catch(() => null);
      const data = json?.ok ? json.data : null;
      if (!data || data.done) {
        launchIntake(idea, data?.brief ?? "");
      } else {
        setIntakeQuestions(data.questions as IntakeQ[]);
        setIntakeAnswers({});
        setIntakeQIndex(0);
        setIntakePhase("asking");
      }
    } catch {
      launchIntake(idea, "");
    }
  }

  function chooseIdea(text: string) {
    const t = text.trim();
    if (!t) return;
    setIntakeIdea(t);
    setInput("");
    void runEngine(t);
  }

  function answerQuestion(value: string) {
    const q = intakeQuestions[intakeQIndex];
    if (!q) return;
    const answers = { ...intakeAnswers, [q.key]: value.trim() || "Skip" };
    setIntakeAnswers(answers);
    setInput("");
    if (intakeQIndex < intakeQuestions.length - 1) setIntakeQIndex(intakeQIndex + 1);
    else void runEngine(intakeIdea, answers);
  }

  // The composer routes here while the intake is taking input.
  function intakeSubmit(text: string) {
    if (intakePhase === "idle") chooseIdea(text);
    else if (intakePhase === "asking" && text.trim()) answerQuestion(text);
  }

  // Resume an in-flight turn on mount: if the workspace has a live progress
  // label (a turn started here, then the tab was closed/navigated away), show
  // it running again and reload the conversation once it finishes — so work is
  // never lost just because you stepped away.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let resumed = false;
      for (let i = 0; i < 300 && !cancelled; i++) {
        if (localSend.current) return; // a fresh local turn owns the UI
        let label: string | null = null;
        try {
          const res = await fetch(`/api/workspaces/${workspace.id}/progress`, { cache: "no-store" });
          const json = await res.json().catch(() => null);
          label = json?.data?.label ?? null;
        } catch {
          /* transient */
        }
        if (cancelled) return;
        if (label) {
          resumed = true;
          setBusy(true);
          setWorklog((w) => (w.length ? w : [label!]));
          setActivity(label);
          await new Promise((r) => setTimeout(r, 1200));
        } else {
          if (resumed && !localSend.current) {
            setBusy(false);
            // Reload persisted history to pick up the finished reply.
            try {
              const res = await fetch(`/api/workspaces/${workspace.id}`, { cache: "no-store" });
              const json = await res.json().catch(() => null);
              if (!cancelled && res.ok && json?.ok) {
                const fresh = (
                  json.data.messages as { role: "user" | "assistant"; content: string; actions: Action[] | null }[]
                ).map((m) => ({
                  role: m.role,
                  content: m.role === "user" ? stripBrief(m.content) : m.content,
                  actions: m.actions ?? undefined,
                }));
                // Only replace when the reload actually returned rows — a
                // replica-lag empty read must never wipe a live conversation.
                if (fresh.length) {
                  setMessages(fresh);
                  writeCache(`ws:${workspace.id}:messages`, fresh);
                }
              }
            } catch {
              /* keep what's shown */
            }
          }
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  // Manual "Verify build": runs the current build in the sandbox (check only —
  // no auto-fix) and appends the result as a verify-badge message.
  async function verifyNow() {
    if (verifying || busy || messages === null) return;
    setVerifying(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/verify`, { method: "POST" });
      const json = await res.json().catch(() => null);
      const v = json?.data?.verify as { status: string; command?: string; log?: string; reason?: string } | undefined;
      if (res.ok && v) {
        const tool = v.status === "passed" ? "verified" : v.status === "failed" ? "verify_failed" : "verify_skipped";
        const label =
          v.status === "passed"
            ? "verified"
            : v.status === "failed"
              ? "couldn't verify"
              : `verify skipped — ${v.reason ?? "nothing to verify"}`;
        const content =
          v.status === "passed"
            ? `Verified — \`${v.command}\` ran clean.`
            : v.status === "failed"
              ? `Couldn't verify — \`${v.command}\` failed. See the log, then ask me to fix it.`
              : `Verify skipped — ${v.reason ?? "nothing to verify"}.`;
        setMessages((m) => [...(m ?? []), { role: "assistant", content, actions: [{ tool, label, log: v.log }] }]);
      } else {
        setMessages((m) => [...(m ?? []), { role: "assistant", content: json?.error?.message ?? "Couldn't verify." }]);
      }
    } catch {
      setMessages((m) => [...(m ?? []), { role: "assistant", content: "Couldn't reach the verifier. Try again." }]);
    }
    setVerifying(false);
  }

  const VERIFY_TOOLS = ["verified", "verify_failed", "verify_skipped"];
  const uniqueLabels = (actions?: Action[]) =>
    actions?.length ? Array.from(new Set(actions.map((a) => a.label))) : [];

  return (
    <div className="glass-panel-strong relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* Chat header: identity + model switcher */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <span className="label-tactical text-[11px]">Chat</span>
        <div className="ml-auto">
          {isGuest ? (
            <span className="label-tactical">
              beta model
            </span>
          ) : (
            <ModelPicker />
          )}
        </div>
      </div>

      {/* Plan-mode banner: always on while in plan mode so the state is never a
          mystery. Violet — distinct from the amber guest bar and cyan accent. */}
      {mode === "plan" && (
        <div className="fade-up flex items-center gap-2 border-b border-[color-mix(in_srgb,#c084fc_35%,transparent)] bg-[color-mix(in_srgb,#c084fc_11%,transparent)] px-4 py-2 text-[12px] text-[#d8b4fe]">
          <ClipboardList className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
          <span className="font-semibold">Plan mode</span>
          <span className="text-[#d8b4fe]/80">
            Helix proposes a step-by-step plan first — nothing changes until you approve it.
          </span>
        </div>
      )}

      {/* min-h-0 is required: a flex-1 child in a column flex defaults to
          min-height:auto and won't shrink below its content, so without this
          the message list overflows the panel and pushes the input box past
          the panel's overflow-hidden edge (it gets clipped, leaving only the
          header visible). */}
      <div ref={scrollRef} className="scroll-area min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {messages === null ? (
          <div className="grid h-full place-items-center text-sm text-txt3">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> loading…
            </span>
          </div>
        ) : messages.length === 0 && !busy ? (
          intakeActive ? (
            // New-project intake driven by the curation engine (rules + a tiny
            // gated AI call): greeting → idea → dynamic questions → build.
            <div className="space-y-4">
              <div className="flex justify-start gap-2.5">
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-panel2">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                </span>
                <div className="max-w-[88%] rounded-2xl border border-border bg-panel2 px-4 py-2.5 text-sm leading-relaxed text-txt">
                  New project! Before I build — <span className="font-medium">what are you making?</span> A sentence is plenty.
                </div>
              </div>

              {intakePhase === "idle" ? (
                <div className="pl-[38px]">
                  <p className="mb-1.5 text-[11px] text-txt3">Type it below — or start from one of these:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STARTERS.map((sx) => (
                      <button
                        key={sx.title}
                        type="button"
                        onClick={() => chooseIdea(sx.prompt)}
                        className="rounded-full border border-border2 bg-panel2 px-2.5 py-1 text-[11px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                      >
                        {sx.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-end gap-2.5">
                    <div className="inline-block max-w-[88%] rounded-2xl border border-accent/35 bg-hl px-4 py-2.5 text-sm text-txt">
                      {intakeIdea}
                    </div>
                  </div>

                  {intakeQuestions.map((q) => {
                    const ans = intakeAnswers[q.key];
                    const isCurrent = intakePhase === "asking" && intakeQuestions[intakeQIndex]?.key === q.key;
                    if (!ans && !isCurrent) return null;
                    return (
                      <div key={q.key} className="space-y-2">
                        <div className="flex justify-start gap-2.5">
                          <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-panel2">
                            <Sparkles className="h-3.5 w-3.5 text-accent" />
                          </span>
                          <div className="max-w-[88%] rounded-2xl border border-border bg-panel2 px-4 py-2.5 text-sm leading-relaxed text-txt">
                            {q.text}
                          </div>
                        </div>
                        {ans ? (
                          <div className="flex justify-end gap-2.5">
                            <div className="inline-block max-w-[88%] rounded-2xl border border-accent/35 bg-hl px-4 py-2.5 text-sm text-txt">
                              {ans}
                            </div>
                          </div>
                        ) : q.options && q.options.length ? (
                          <div className="flex flex-wrap gap-1.5 pl-[38px]">
                            {q.options.map((o) => (
                              <button
                                key={o}
                                type="button"
                                onClick={() => answerQuestion(o)}
                                className="rounded-full border border-border2 bg-panel2 px-3 py-1 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                              >
                                {o}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => answerQuestion("Skip")}
                              className="rounded-full px-3 py-1 text-[11.5px] text-txt3 transition-colors hover:text-txt"
                            >
                              Skip
                            </button>
                          </div>
                        ) : (
                          <p className="pl-[38px] text-[11px] text-txt3">Type your answer below, or leave it blank to skip.</p>
                        )}
                      </div>
                    );
                  })}

                  {intakePhase === "thinking" && (
                    <div className="flex justify-start gap-2.5">
                      <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-panel2">
                        <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" />
                      </span>
                      <div className="flex max-w-[88%] items-center gap-2 rounded-2xl border border-border bg-panel2 px-4 py-2.5 text-sm text-txt2">
                        <Loader2 className="h-4 w-4 animate-spin text-accent" /> Curating your project…
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
          <div className="grid h-full place-items-center text-center">
            <div className="w-full max-w-md px-2">
              <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-border2 bg-panel2 shadow-card">
                <Sparkles className="h-7 w-7 text-accent" />
              </div>
              <h2 className="brand-gradient-text mb-2 text-2xl font-semibold tracking-tight">
                {workspace.mode === "IMPORT" ? workspace.repo : "What are we building?"}
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-txt2">
                {workspace.mode === "IMPORT"
                  ? "Ask Helix to change anything in this repo — it reads the files, edits them in the workspace, and you push when ready."
                  : "Describe the app you want. Files appear in the workspace as Helix writes them — push to GitHub when you like what you see."}
              </p>
              {workspace.mode === "SCRATCH" && (
                <div className="grid gap-2 text-left">
                  {STARTERS.map((sx) => (
                    <button
                      key={sx.title}
                      type="button"
                      onClick={() => void send(sx.prompt)}
                      className="group flex items-start gap-3 rounded-xl border border-border bg-panel2 px-4 py-2.5
                                 transition-colors hover:border-accent hover:bg-hl"
                    >
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-panel3 group-hover:border-accent/40">
                        <sx.icon className="h-3.5 w-3.5 text-accent" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-txt">{sx.title}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-txt3">{sx.prompt}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          )
        ) : (
          <>
            {messages.map((m, i) => {
              const labels = uniqueLabels(
                m.actions?.filter((a) => a.tool !== "plan" && !VERIFY_TOOLS.includes(a.tool)),
              );
              const isPlan = Boolean(m.actions?.some((a) => a.tool === "plan"));
              const verifyAction = m.actions?.find((a) => VERIFY_TOOLS.includes(a.tool));
              const lastAssistantIdx = messages.reduce(
                (last, msg, idx) => (msg.role === "assistant" ? idx : last),
                -1,
              );
              const showPlanButtons = isPlan && i === lastAssistantIdx && isOwner && !busy;
              // Manual "Verify build" on the latest assistant turn (when not a
              // plan and it doesn't already carry a verify result).
              const showVerifyBtn =
                m.role === "assistant" && i === lastAssistantIdx && isOwner && !isPlan && !verifyAction && !isGuest;
              return (
                <div key={i} className={cn("flex gap-2.5", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "assistant" && (
                    <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-panel2">
                      {isPlan ? (
                        <Map className="h-3.5 w-3.5 text-accent" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-accent" />
                      )}
                    </span>
                  )}
                  <div className={cn("max-w-[88%]", m.role === "user" ? "" : "w-full")}>
                    <div
                      className={cn(
                        "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        m.role === "user"
                          ? "inline-block border border-accent/35 bg-hl text-txt"
                          : isPlan
                            ? "border border-accent/35 bg-panel2 text-txt"
                            : "border border-border bg-panel2 text-txt",
                      )}
                    >
                      {isPlan && (
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                          Proposed plan
                        </div>
                      )}
                      {m.role === "assistant" ? <Linkified text={m.content} /> : m.content}
                    </div>
                    {showPlanButtons && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-1">
                        <Button
                          onClick={() => {
                            setMode("build");
                            void send(
                              "Execute this approved plan exactly, step by step:\n\n" + m.content.slice(0, 6000),
                              "build",
                            );
                          }}
                          className="px-3 py-1.5 text-xs"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve & build
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setMode("plan");
                            inputRef.current?.focus();
                          }}
                          className="px-3 py-1.5 text-xs"
                        >
                          <PencilLine className="h-3.5 w-3.5" /> Revise
                        </Button>
                      </div>
                    )}
                    {/* Verify result badge + expandable run log */}
                    {verifyAction && (
                      <div className="mt-2 pl-1">
                        <button
                          type="button"
                          onClick={() => verifyAction.log && setOpenLog((cur) => (cur === i ? null : i))}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium",
                            verifyAction.tool === "verified"
                              ? "border-ok/40 bg-ok/10 text-ok"
                              : verifyAction.tool === "verify_failed"
                                ? "border-warn/40 bg-warn/10 text-warn"
                                : "border-border2 bg-panel2 text-txt3",
                            verifyAction.log ? "cursor-pointer" : "cursor-default",
                          )}
                        >
                          {verifyAction.tool === "verified" ? (
                            <CircleCheck className="h-3.5 w-3.5" />
                          ) : verifyAction.tool === "verify_failed" ? (
                            <TriangleAlert className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                          {verifyAction.label}
                          {verifyAction.log && (
                            <ChevronDown
                              className={cn("h-3 w-3 transition-transform", openLog === i && "rotate-180")}
                            />
                          )}
                        </button>
                        {openLog === i && verifyAction.log && (
                          <pre className="scroll-area mt-1.5 max-h-48 overflow-auto rounded-lg border border-border bg-codebg px-3 py-2 font-mono text-[10.5px] leading-relaxed text-txt2">
                            {verifyAction.log}
                          </pre>
                        )}
                      </div>
                    )}
                    {showVerifyBtn && (
                      <div className="mt-2 pl-1">
                        <Button
                          variant="ghost"
                          onClick={() => void verifyNow()}
                          disabled={verifying}
                          className="px-3 py-1.5 text-xs"
                          title="Run the build in the sandbox and check it works"
                        >
                          {verifying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                          {verifying ? "Verifying…" : "Verify build"}
                        </Button>
                      </div>
                    )}
                    {labels.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
                        <Wrench className="h-3 w-3 text-txt3" />
                        {labels.map((l, j) => (
                          <span key={j} className="font-mono text-[10px] text-txt3">
                            {l}
                            {j < labels.length - 1 ? " ·" : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {busy && (
              <div className="flex justify-start gap-2.5">
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-panel2">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" />
                </span>
                {streaming ? (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-accent/25 bg-hl px-4 py-2.5 text-sm text-txt">
                    {streaming}
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-accent align-middle" />
                  </div>
                ) : worklog.length > 0 ? (
                  // Live checklist of the agent's real work this turn.
                  <div className="min-w-0 max-w-[85%] rounded-2xl border border-accent/25 bg-hl px-4 py-2.5">
                    {worklog.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5 text-txt2">
                        {i === worklog.length - 1 ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                        ) : (
                          <Check className="h-3.5 w-3.5 shrink-0 text-ok" strokeWidth={2.4} />
                        )}
                        <span className="font-mono text-[11.5px]">{step}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl border border-accent/25 bg-hl px-4 py-2.5 text-sm text-txt2">
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    <span className="font-mono text-[12px]">{activity ?? "thinking…"}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {isGuest && (
        <div className="flex items-center gap-2 border-t border-warn/25 bg-warn/10 px-4 py-1.5">
          <span className="label-tactical text-warn">
            guest mode
          </span>
          <span className="text-[11px] text-txt2">
            {guestBlocked
              ? "allowance used up"
              : guestRemaining !== null
                ? `~${guestRemaining.toLocaleString()} AI tokens left`
                : "limited AI allowance"}
          </span>
          <a
            href="/login"
            className="ml-auto text-[11px] text-accent underline underline-offset-2 hover:brightness-110"
          >
            Sign in to keep building
          </a>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="scroll-area max-h-40 overflow-y-auto border-t border-border bg-panel2/40">
          <div className="flex items-center gap-1.5 px-4 pt-2 pb-1">
            <Clock className="h-3 w-3 text-txt3" />
            <span className="label-tactical text-[10px]">Background tasks</span>
          </div>
          <div className="space-y-px px-2 pb-2">
            {tasks.map((t) => {
              const dot =
                t.status === "done"
                  ? "bg-ok"
                  : t.status === "error"
                    ? "bg-bad"
                    : t.status === "running"
                      ? "bg-accent animate-pulse"
                      : "bg-txt3";
              const done = t.status === "done";
              const hasChanges =
                done && t.changes && (t.changes.written.length > 0 || t.changes.deleted.length > 0);
              return (
                <div
                  key={t.id}
                  title={t.status === "error" ? (t.error ?? "Task failed") : t.prompt}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-panel2"
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-txt2">{t.prompt}</span>
                  {hasChanges && (
                    <button
                      type="button"
                      onClick={() => onChanges(t.changes!.written, t.changes!.deleted)}
                      className="inline-flex shrink-0 items-center gap-1 text-[10.5px] text-accent underline-offset-2 hover:underline"
                    >
                      <GitCompare className="h-3 w-3" /> view changes
                    </button>
                  )}
                  <span className="shrink-0 font-mono text-[10px] text-txt3">
                    {timeAgo(t.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isOwner ? (
        <div className="flex items-center gap-2 border-t border-border bg-panel2/40 px-4 py-3 text-[12.5px] text-txt3">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Read-only — copy this workspace to chat with Helix.
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (intakeActive) intakeSubmit(input);
            else void send(input);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <Segmented
            options={[
              { value: "build", label: "Build" },
              { value: "plan", label: "Plan" },
            ]}
            value={mode}
            onChange={changeMode}
            aria-label="Agent mode"
            className="shrink-0"
          />
          {mode === "build" && !isGuest && (
            <button
              type="button"
              onClick={() => setVerifyOn((v) => !v)}
              aria-pressed={verifyOn}
              title={
                verifyOn
                  ? "Auto-verify ON — builds run in the sandbox and auto-fix"
                  : "Auto-verify OFF — turn on to run + fix builds automatically"
              }
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                verifyOn
                  ? "border-accent/50 bg-hl text-accent"
                  : "border-border2 bg-panel text-txt3 hover:border-accent hover:text-txt2",
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Verify</span>
            </button>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={guestBlocked}
            placeholder={
              guestBlocked
                ? "Guest allowance used — sign in to continue"
                : intakeActive
                  ? intakePhase === "idle"
                    ? "Tell Helix what you want to build…"
                    : intakePhase === "asking"
                      ? "Type an answer, or tap an option above…"
                      : "Curating…"
                  : mode === "plan"
                    ? "Describe it — Helix plans first, builds after you approve…"
                    : workspace.mode === "IMPORT"
                      ? "Describe a change to this repo…"
                      : "Describe the app you want built…"
            }
            className="flex-1 rounded-xl border border-border bg-bg2 px-4 py-2.5 text-sm text-txt placeholder:text-txt3 focus:border-accent focus:outline-none disabled:opacity-60"
          />
          {!isGuest && mode === "build" && (
            <Button
              type="button"
              variant="ghost"
              aria-label="Queue as background task"
              title="Queue as a background task"
              onClick={() => void queueTask(input)}
              disabled={busy || queuingTask || !input.trim()}
              className="shrink-0 px-3 py-2.5"
            >
              {queuingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            </Button>
          )}
          <Button
            type="submit"
            disabled={busy || !input.trim() || guestBlocked}
            className="shrink-0 px-3 py-2.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      )}

      {/* Mode-change toast: slides up over the composer, auto-dismisses. */}
      {modeToast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fade-up pointer-events-none absolute bottom-[72px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-card border bg-panel px-4 py-2.5 text-[12.5px] shadow-pop",
            modeToast === "plan"
              ? "border-[color-mix(in_srgb,#c084fc_45%,transparent)] text-[#d8b4fe]"
              : "border-accent/45 text-accent",
          )}
        >
          {modeToast === "plan" ? (
            <ClipboardList className="h-4 w-4 shrink-0" strokeWidth={1.9} />
          ) : (
            <Wrench className="h-4 w-4 shrink-0" strokeWidth={1.9} />
          )}
          <span className="font-semibold">{modeToast === "plan" ? "Plan mode on" : "Build mode on"}</span>
          <span className="text-txt3">
            {modeToast === "plan" ? "— I’ll propose a plan first" : "— I’ll edit files directly"}
          </span>
        </div>
      )}
    </div>
  );
}
