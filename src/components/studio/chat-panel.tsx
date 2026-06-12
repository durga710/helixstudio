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
}: {
  workspace: WorkspaceMeta;
  onChanges: (written: string[], deleted: string[]) => void;
  isGuest?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[] | null>(null); // null = loading history
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  // null until the first chat turn reports it; counts down to 0.
  const [guestRemaining, setGuestRemaining] = useState<number | null>(null);
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

  // While a turn runs, poll the live-activity channel — real tool steps
  // ("reading src/App.jsx…", "writing 3 file(s)…"), not theatre.
  useEffect(() => {
    if (!busy) {
      setActivity(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/progress`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.ok) setActivity(json.data.label);
      } catch {
        // keep the last label
      }
    };
    void poll();
    const t = setInterval(poll, 1200);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [busy, workspace.id]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || messages === null) return;
    setMessages((m) => [...(m ?? []), { role: "user", content }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (json?.error?.code === "GUEST_LIMIT") setGuestRemaining(0);
        setMessages((m) => [
          ...(m ?? []),
          { role: "assistant", content: json?.error?.message ?? "Something went wrong." },
        ]);
      } else {
        setMessages((m) => [
          ...(m ?? []),
          { role: "assistant", content: json.data.text, actions: json.data.actions },
        ]);
        if (typeof json.data.guestRemaining === "number") {
          setGuestRemaining(json.data.guestRemaining);
        }
        const ch = json.data.changes as { written: string[]; deleted: string[] } | undefined;
        if (ch && (ch.written.length > 0 || ch.deleted.length > 0)) {
          onChanges(ch.written, ch.deleted);
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
        <Button
          type="submit"
          disabled={busy || !input.trim() || guestBlocked}
          className="shrink-0 px-3 py-2.5"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
