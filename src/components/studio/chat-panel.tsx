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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WorkspaceMeta } from "@/components/studio/studio";
import { ModelPicker } from "@/components/studio/model-picker";

interface Action {
  tool: string;
  label: string;
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
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  // null until the first chat turn reports it; counts down to 0.
  const [guestRemaining, setGuestRemaining] = useState<number | null>(null);
  const [tasks, setTasks] = useState<BgTask[]>([]);
  const [queuingTask, setQueuingTask] = useState(false);
  const guestBlocked = isGuest && guestRemaining === 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.ok) {
          setMessages(
            (json.data.messages as { role: "user" | "assistant"; content: string; actions: Action[] | null }[]).map(
              (m) => ({ role: m.role, content: m.content, actions: m.actions ?? undefined }),
            ),
          );
        } else {
          setMessages([]);
        }
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!busy) setActivity(null);
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

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || messages === null) return;
    setMessages((m) => [...(m ?? []), { role: "user", content }]);
    setInput("");
    setBusy(true);

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
        body: JSON.stringify({ message: content }),
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
            setActivity((evt.label as string) ?? null);
          } else if (evt.type === "final") {
            handleFinal(evt as Parameters<typeof handleFinal>[0]);
          } else if (evt.type === "error") {
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
    setBusy(false);
  }

  const uniqueLabels = (actions?: Action[]) =>
    actions?.length ? Array.from(new Set(actions.map((a) => a.label))) : [];

  return (
    <div className="glass-panel-strong flex h-full min-h-0 flex-col overflow-hidden">
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

      <div ref={scrollRef} className="scroll-area flex-1 space-y-4 overflow-y-auto p-5">
        {messages === null ? (
          <div className="grid h-full place-items-center text-sm text-txt3">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> loading…
            </span>
          </div>
        ) : messages.length === 0 && !busy ? (
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
        ) : (
          <>
            {messages.map((m, i) => {
              const labels = uniqueLabels(m.actions);
              return (
                <div key={i} className={cn("flex gap-2.5", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "assistant" && (
                    <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-panel2">
                      <Sparkles className="h-3.5 w-3.5 text-accent" />
                    </span>
                  )}
                  <div className={cn("max-w-[88%]", m.role === "user" ? "" : "w-full")}>
                    <div
                      className={cn(
                        "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        m.role === "user"
                          ? "inline-block border border-accent/35 bg-hl text-txt"
                          : "border border-border bg-panel2 text-txt",
                      )}
                    >
                      {m.role === "assistant" ? <Linkified text={m.content} /> : m.content}
                    </div>
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
                <div className="flex items-center gap-2 rounded-2xl border border-accent/25 bg-hl px-4 py-2.5 text-sm text-txt2">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  <span className="font-mono text-[12px]">{activity ?? "thinking…"}</span>
                </div>
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
            void send(input);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={guestBlocked}
            placeholder={
              guestBlocked
                ? "Guest allowance used — sign in to continue"
                : workspace.mode === "IMPORT"
                  ? "Describe a change to this repo…"
                  : "Describe the app you want built…"
            }
            className="flex-1 rounded-xl border border-border bg-bg2 px-4 py-2.5 text-sm text-txt placeholder:text-txt3 focus:border-accent focus:outline-none disabled:opacity-60"
          />
          {!isGuest && (
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
    </div>
  );
}
