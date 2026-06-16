/* eslint-disable react-hooks/set-state-in-effect -- ported GCODE studio code; its fetch-on-mount/poll effects predate this rule and behave correctly */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Sparkles,
  Wrench,
  Globe,
  UserRound,
  CreditCard,
  Newspaper,
  LayoutDashboard,
  ShoppingBag,
  CalendarDays,
  MessageSquare,
  ListTodo,
  BookOpen,
  Building2,
  Utensils,
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
  Gamepad2,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { GAME_CATEGORIES } from "@/lib/templates/engines";
import { cn } from "@/lib/utils";
import { warmupSteps } from "@/lib/warmup-steps";
import { buildNarration, friendlyActivity, paraphraseRequest, holdingLines, seededRng } from "@/lib/build-feed";
import { readCache, writeCache } from "@/lib/client-cache";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Markdown } from "@/components/ui/markdown";
import type { WorkspaceMeta } from "@/components/studio/studio";
import { ModelPicker } from "@/components/studio/model-picker";
import { takeAutoBuild } from "@/components/studio/use-workspace-creation";

interface Action {
  tool: string;
  label: string;
  log?: string; // present on verify markers
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
  /** The model's own raw reply, kept behind a "details" toggle when we showed
   * our own synthesized summary as the message content (hybrid). */
  aiText?: string;
  /** The turn's live step feed, kept ON the message so it doesn't vanish when
   * the turn ends (the editor used to clear it and show only the summary). */
  worklog?: string[];
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

// A pool of app starters — we show a VARIED subset (seeded per project) so two
// projects never get the same four suggestions.
const STARTERS = [
  { icon: Globe, title: "Waitlist landing page", prompt: "A waitlist landing page with a bold hero and email signup form" },
  { icon: UserRound, title: "Portfolio site", prompt: "A personal portfolio site with an about section and project cards" },
  { icon: CreditCard, title: "Pricing page", prompt: "A pricing page with three tiers and a featured plan" },
  { icon: Newspaper, title: "Mini blog", prompt: "A simple blog with three sample posts and a clean reading layout" },
  { icon: LayoutDashboard, title: "Analytics dashboard", prompt: "An analytics dashboard with summary cards and a couple of charts" },
  { icon: ListTodo, title: "Task tracker", prompt: "A task tracker with a board, draggable cards, and statuses" },
  { icon: ShoppingBag, title: "Product page", prompt: "A product landing page with a gallery, features, and a buy button" },
  { icon: CalendarDays, title: "Event page", prompt: "An event page with a schedule, speakers, and an RSVP form" },
  { icon: MessageSquare, title: "Feedback board", prompt: "A feedback board where people can post ideas and upvote them" },
  { icon: BookOpen, title: "Docs site", prompt: "A documentation site with a sidebar, search, and clean reading pages" },
  { icon: Building2, title: "Startup site", prompt: "A startup marketing site with a hero, features, testimonials, and a CTA" },
  { icon: Utensils, title: "Recipe site", prompt: "A recipe site with cards, a detail page, and a search bar" },
] as const;

/** Deterministically shuffle then take `n` from a pool, using a seeded PRNG so
 * the choice is stable for one project but varies across projects. */
function pickN<T>(pool: readonly T[], n: number, seed: string): T[] {
  const rng = seededRng(seed);
  return [...pool].sort(() => rng() - 0.5).slice(0, n);
}

/** Mode-specific starter suggestions — NEVER cross-mode, and DYNAMIC: a different
 * varied set per project (seeded by the workspace id) so the same four ideas
 * never show every time. A game editor shows its category's game ideas. */
function starterSuggestions(ws: WorkspaceMeta): { icon: LucideIcon; title: string; prompt: string }[] {
  if (ws.kind === "game") {
    const cat = ws.gameCategory ? GAME_CATEGORIES.find((c) => c.id === ws.gameCategory) : undefined;
    const sugg = cat?.suggestions ?? GAME_CATEGORIES[0].suggestions;
    return pickN(sugg, 4, ws.id).map((s) => ({ icon: Gamepad2, title: s, prompt: s }));
  }
  return pickN(STARTERS, 4, ws.id).map((s) => ({ icon: s.icon, title: s.title, prompt: s.prompt }));
}

/** Inviting, mode-specific greeting + a graceful hint at what you can ask for. */
function modeGreeting(ws: WorkspaceMeta): { title: string; body: string } {
  if (ws.mode === "IMPORT") {
    return {
      title: ws.repo ?? "Your repo",
      body: "Ask Helix to change anything in this repo — it reads the files, edits them in the workspace, and you push when ready.",
    };
  }
  if (ws.kind === "game") {
    const cat = ws.gameCategory ? GAME_CATEGORIES.find((c) => c.id === ws.gameCategory) : undefined;
    const is3d = (cat?.templateId ?? "").includes("3d");
    return {
      title: "What game are we making?",
      body: is3d
        ? "Describe the game and Helix builds it — hit Play to try it. You can ask to change the environment or background, add objects to the world, move the camera, or drop in obstacles and pickups."
        : "Describe the game and Helix builds it — hit Play to try it. You can ask to add levels, enemies, a scoreboard, power-ups, sounds, or change how it looks.",
    };
  }
  return {
    title: "What are we building?",
    body: "Describe the app you want — files appear as Helix writes them. You can ask for new pages, a form, a dashboard, or a fresh look anytime, then push to GitHub when you like it.",
  };
}

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

/** Map a persisted message to a Msg. An assistant turn with a stored `summary`
 * (our synthesized prose) shows the summary, with the model's raw reply kept
 * behind the "details" toggle — so a reload matches exactly what was shown live. */
type HistoryMsg = { role: "user" | "assistant"; content: string; summary?: string | null; actions?: Action[] | null };
// Markers that have their own UI (the plan card / the verify badge) — kept out
// of the reconstructed step list so they aren't shown twice.
const NON_STEP_TOOLS = new Set(["plan", "verified", "verify_failed", "verify_skipped"]);
function hydrateMessage(m: HistoryMsg): Msg {
  if (m.role === "user") return { role: "user", content: stripBrief(m.content), actions: m.actions ?? undefined };
  // Rebuild the turn's step feed from the persisted actions (the real ordered
  // tool work — "read X", "wrote 3 files", "edited Y") so the steps survive a
  // reload, not just the live session.
  const steps = Array.isArray(m.actions)
    ? m.actions.filter((a) => !NON_STEP_TOOLS.has(a.tool)).map((a) => a.label)
    : [];
  const worklog = steps.length ? steps : undefined;
  return m.summary
    ? { role: "assistant", content: m.summary, actions: m.actions ?? undefined, aiText: m.content || undefined, worklog }
    : { role: "assistant", content: m.content, actions: m.actions ?? undefined, worklog };
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
  const [openDetails, setOpenDetails] = useState<number | null>(null); // message index with expanded "what the model said"
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  // The turn's activity as a live ticking checklist (the agent's REAL work —
  // reading, writing, verifying), so a big "create infrastructure" task reads
  // as genuine progress instead of one cycling loader line.
  const [worklog, setWorklog] = useState<string[]>([]);
  // Mirror of worklog so the final-event handler can snapshot the steps onto the
  // message synchronously (state isn't readable in the handler closure).
  const worklogRef = useRef<string[]>([]);
  useEffect(() => {
    worklogRef.current = worklog;
  }, [worklog]);
  // Live assistant reply, streamed token-by-token (replaced by the real message
  // on the final event).
  const [streaming, setStreaming] = useState("");
  // null until the first chat turn reports it; counts down to 0.
  const [guestRemaining, setGuestRemaining] = useState<number | null>(null);
  const [tasks, setTasks] = useState<BgTask[]>([]);
  const [queuingTask, setQueuingTask] = useState(false);
  const guestBlocked = isGuest && guestRemaining === 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  // "Ideas" popover: re-opens the mode-specific greeting + suggestions after the
  // conversation has started (so the opening guidance is always one click away).
  const [ideasOpen, setIdeasOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Flips true on the turn's first real activity event, so the warm-up prelude
  // knows to stop and hand off to the agent's actual work.
  const realActivityStarted = useRef(false);
  // Live "construction feed": true while the new-project scaffold narration is
  // playing (so we suppress the noisy raw file-write labels and let the friendly
  // feed own the story); turnDone stops the feed the instant the turn resolves.
  const feedActive = useRef(false);
  const turnDone = useRef(false);
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

  // Auto-grow the composer with its content up to ~40% of the viewport, then it
  // scrolls — so writing several paragraphs is comfortable (like Claude/ChatGPT),
  // not trapped on one line. Shrinks back after a send clears the input.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.max(160, Math.round(window.innerHeight * 0.4));
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [input]);

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
          const fresh = (json.data.messages as HistoryMsg[]).map(hydrateMessage);
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

  // Auto-build on arrival: prompt-first creation hands the idea over via
  // sessionStorage; fire it once as the first build turn so a brand-new workspace
  // builds itself (the user sees "building → their app", never the bare skeleton).
  // Guarded to a workspace with no existing conversation, and consume-once.
  const autoBuildFired = useRef(false);
  useEffect(() => {
    if (autoBuildFired.current || messages === null || messages.length > 0 || busy) return;
    const idea = takeAutoBuild(workspace.id);
    if (!idea) return;
    autoBuildFired.current = true;
    void send(idea, "build");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire-once is guarded by the ref; send is hoisted/stable
  }, [messages, busy, workspace.id]);

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

  // The live construction feed: narrate the just-injected starter template as
  // paced, friendly "building …" lines (from the REAL files) so the chat stays
  // alive and premium while the agent customizes the skeleton in the background.
  function startBuildFeed(files: string[], idea: string) {
    if (feedActive.current) return;
    feedActive.current = true;
    realActivityStarted.current = true; // the generic warm-up bows out
    const kind = workspace.kind === "game" ? "game" : "app";
    // Seeded by the workspace id → varied wording/order per project (never reads
    // as canned), but stable within this project. The estimate paces it so a
    // fast build shows calmer lines and a big one shows more.
    const { steps, holding, estimateMs } = buildNarration(files, { idea, kind, seed: workspace.id });
    const perStep = Math.max(700, Math.min(2600, Math.round(estimateMs / Math.max(4, steps.length))));
    const sequence = [...steps, ...holding];
    void (async () => {
      for (let i = 0; i < sequence.length; i++) {
        if (turnDone.current) return;
        setWorklog((w) => (turnDone.current ? w : [...w, sequence[i]]));
        // Concrete file lines pace to the estimate; the generic tail breathes
        // slower, and the LAST item always spins so it reads live until the
        // real reply lands.
        const concrete = i < steps.length;
        await new Promise((r) => setTimeout(r, (concrete ? perStep : 2600) + Math.random() * (concrete ? 300 : 1400)));
      }
    })();
  }

  // Follow-up requests on an existing project: open with a paraphrase of what
  // they asked (never echoed verbatim), then breathe with varied holding lines —
  // so a fix turn reads like a real assistant working, not a blank loader.
  function startFixFeed(message: string) {
    if (feedActive.current) return;
    feedActive.current = true;
    realActivityStarted.current = true;
    const seed = `${workspace.id}:${message}`;
    const seq = [`${paraphraseRequest(message, seed)}…`, ...holdingLines(seed)];
    void (async () => {
      for (let i = 0; i < seq.length; i++) {
        if (turnDone.current) return;
        setWorklog((w) => (turnDone.current ? w : [...w, seq[i]]));
        await new Promise((r) => setTimeout(r, 1100 + Math.random() * 900));
      }
    })();
  }

  async function send(
    text: string,
    sendMode: "plan" | "build" = mode,
    sendVerify: boolean = verifyOn,
    brief?: string,
  ) {
    const content = text.trim();
    if (!content || busy || messages === null) return;
    // A from-scratch workspace with nothing built yet (no assistant turn) is a
    // NEW project — the warm-up must use new-project framing, never "reviewing
    // the existing code", because there isn't any yet.
    const isNewProject = workspace.mode === "SCRATCH" && !messages.some((m) => m.role === "assistant");
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
    feedActive.current = false;
    turnDone.current = false;
    if (sendMode === "build" && !isNewProject) {
      // Follow-up build/fix on an existing project → paraphrased "on it" feed.
      // (A new project waits for the scaffold event → construction feed.)
      startFixFeed(content);
    } else {
      void (async () => {
        for (const step of warmupSteps(content, { isNewProject })) {
          if (realActivityStarted.current) break;
          setWorklog((w) => (realActivityStarted.current ? w : [...w, step]));
          await new Promise((r) => setTimeout(r, 360 + Math.floor(Math.random() * 560)));
        }
      })();
    }

    // Replicates the old success path: append the assistant turn, update the
    // guest counter, and surface any file changes to the workspace panel.
    const handleFinal = (data: {
      text?: string;
      summary?: string;
      actions?: Action[];
      changes?: TaskChanges;
      guestRemaining?: number;
    }) => {
      // Hybrid: the SERVER computed our user-facing summary (varied, truthful,
      // and PERSISTED, so a reload matches this exactly). When present we show it
      // and tuck the model's own reply behind a "details" toggle; Q&A/plan turns
      // (no summary) keep the model's text.
      const steps = worklogRef.current.length ? [...worklogRef.current] : undefined;
      setMessages((m) => [
        ...(m ?? []),
        data.summary
          ? { role: "assistant", content: data.summary, actions: data.actions, aiText: data.text || undefined, worklog: steps }
          : { role: "assistant", content: data.text ?? "", actions: data.actions, worklog: steps },
      ]);
      if (typeof data.guestRemaining === "number") setGuestRemaining(data.guestRemaining);
      const ch = data.changes;
      if (ch && (ch.written.length > 0 || ch.deleted.length > 0)) onChanges(ch.written, ch.deleted);
    };

    // Watchdog: a build turn can legitimately run a while, but it must NEVER
    // hang the chat forever. If the whole turn outlasts the server ceiling
    // (~300s) we abort so the UI resolves to a retry instead of an endless
    // spinner. Reset on the finally below.
    const ctl = new AbortController();
    const watchdog = setTimeout(() => ctl.abort(), 315_000);
    let resolved = false; // did we receive a final or error event?

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, mode: sendMode, verify: sendVerify, brief: brief || undefined }),
        signal: ctl.signal,
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
          if (evt.type === "scaffold") {
            // New project: the starter template just landed — narrate it as a
            // live "building …" feed from the real files (masks model latency).
            startBuildFeed((evt.files as string[]) ?? [], content);
          } else if (evt.type === "activity") {
            const label = (evt.label as string) ?? "";
            // Real work has begun — let the warm-up prelude bow out.
            realActivityStarted.current = true;
            if (feedActive.current) {
              // During the construction feed, rephrase real labels into the same
              // warm, varied voice (verify → "Running a quick test…") and drop
              // the noisy file-write labels — the stored feed owns the narrative.
              const shown = friendlyActivity(label, workspace.id);
              if (shown) {
                setActivity(shown);
                setWorklog((w) => [...w, shown]);
              }
            } else {
              setActivity(label || null);
              if (label) setWorklog((w) => [...w, label]);
            }
          } else if (evt.type === "delta") {
            realActivityStarted.current = true; // the reply is streaming — stop warm-up
            feedActive.current = false; // the real reply is here — stop the feed
            turnDone.current = true;
            setStreaming((s) => s + ((evt.text as string) ?? ""));
          } else if (evt.type === "final") {
            resolved = true;
            turnDone.current = true;
            feedActive.current = false;
            setStreaming("");
            handleFinal(evt as Parameters<typeof handleFinal>[0]);
          } else if (evt.type === "error") {
            resolved = true;
            turnDone.current = true;
            feedActive.current = false;
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
        // The stream closed but never delivered a final/error — don't leave the
        // user staring at a finished-looking feed with no result.
        if (!resolved) {
          setMessages((m) => [
            ...(m ?? []),
            {
              role: "assistant",
              content:
                "The build didn't report back — it may still be finishing in the background. Reload in a moment to see the result, or send your request again.",
            },
          ]);
        }
      } else {
        // Fallback for an older, non-streaming server.
        resolved = true;
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
      // Aborted by the watchdog vs. a real network failure — different copy, but
      // either way the chat resolves instead of hanging forever.
      setMessages((m) => [
        ...(m ?? []),
        {
          role: "assistant",
          content: ctl.signal.aborted
            ? "This is taking longer than expected — the build may still be finishing in the background. Reload in a moment, or try again."
            : "Network error. Try again.",
        },
      ]);
    } finally {
      clearTimeout(watchdog);
      turnDone.current = true;
      feedActive.current = false;
    }
    setStreaming("");
    setBusy(false);
    localSend.current = false;
  }

  /* --------------------- new-project intake ----------------------- */

  // Runs only for a brand-new, empty scratch workspace.
  const intakeActive =
    messages !== null && messages.length === 0 && !busy && workspace.mode === "SCRATCH" && intakePhase !== "done";

  // Keep the curation Q&A visible in the thread after the build starts — it
  // reads like a real conversation instead of vanishing. Only when questions
  // were actually asked + answered (the idea itself stays in the message list).
  const showIntakeTranscript =
    Boolean(intakeIdea) && intakeQuestions.length > 0 && intakeQuestions.some((q) => intakeAnswers[q.key]);

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
                const fresh = (json.data.messages as HistoryMsg[]).map(hydrateMessage);
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
        const cmdLabel = !v.command
          ? "the build"
          : v.command === "script syntax check" || v.command.startsWith("for f in")
            ? "a syntax check on your scripts"
            : v.command === "headless runtime check"
              ? "a test run in a browser"
              : `\`${v.command}\``;
        const content =
          v.status === "passed"
            ? `Verified — ${cmdLabel} ran clean.`
            : v.status === "failed"
              ? `Couldn't verify — ${cmdLabel} failed. See the log, then ask me to fix it.`
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
      <div className="relative flex items-center gap-2 border-b border-border px-4 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <span className="label-tactical text-[11px]">Chat</span>
        <div className="ml-auto flex items-center gap-2">
          {workspace.mode === "SCRATCH" && messages && messages.length > 0 && (
            <button
              type="button"
              onClick={() => setIdeasOpen((v) => !v)}
              title="Ideas & what you can ask for"
              className="inline-flex items-center gap-1 rounded-lg border border-border2 bg-panel2 px-2 py-1 text-[11px] text-txt2 transition-colors hover:border-accent hover:text-txt"
            >
              <Lightbulb className="h-3.5 w-3.5 text-accent" /> Ideas
            </button>
          )}
          {isGuest ? (
            <span className="label-tactical">
              beta model
            </span>
          ) : (
            <ModelPicker />
          )}
        </div>
        {ideasOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIdeasOpen(false)} />
            <div className="absolute right-3 top-[calc(100%+4px)] z-50 w-[min(340px,90vw)] rounded-xl border border-border2 bg-panel p-3 shadow-pop">
              <p className="mb-1 text-[13px] font-semibold text-txt">{modeGreeting(workspace).title}</p>
              <p className="mb-2.5 text-[11.5px] leading-relaxed text-txt3">{modeGreeting(workspace).body}</p>
              <div className="flex flex-col gap-1.5">
                {starterSuggestions(workspace).map((sx) => (
                  <button
                    key={sx.title}
                    type="button"
                    onClick={() => {
                      setInput(sx.prompt);
                      setIdeasOpen(false);
                    }}
                    className="rounded-lg border border-border bg-panel2 px-3 py-1.5 text-left text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                  >
                    {sx.title}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
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
                  New project! Before I build —{" "}
                  <span className="font-medium">
                    {workspace.kind === "game" ? "what game do you want to make?" : "what are you making?"}
                  </span>{" "}
                  A sentence is plenty.
                </div>
              </div>

              {intakePhase === "idle" ? (
                <div className="pl-[38px]">
                  <p className="mb-1.5 text-[11px] text-txt3">Type it below — or start from one of these:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {starterSuggestions(workspace).map((sx) => (
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
                {modeGreeting(workspace).title}
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-txt2">{modeGreeting(workspace).body}</p>
              {workspace.mode === "SCRATCH" && (
                <div className="grid gap-2 text-left">
                  {starterSuggestions(workspace).map((sx) => (
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
                        {sx.title !== sx.prompt && (
                          <span className="mt-0.5 block text-xs leading-snug text-txt3">{sx.prompt}</span>
                        )}
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
            {showIntakeTranscript && (
              <div className="space-y-4">
                <div className="flex justify-end gap-2.5">
                  <div className="inline-block max-w-[88%] rounded-2xl border border-accent/35 bg-hl px-4 py-2.5 text-sm text-txt">
                    {intakeIdea}
                  </div>
                </div>
                {intakeQuestions.map((q) => {
                  const ans = intakeAnswers[q.key];
                  if (!ans) return null;
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
                      <div className="flex justify-end gap-2.5">
                        <div className="inline-block max-w-[88%] rounded-2xl border border-accent/35 bg-hl px-4 py-2.5 text-sm text-txt">
                          {ans}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* The opening greeting stays as the FIRST message in the thread, so a
                new chat reads as "the AI greeted you, then you replied" — not your
                prompt sitting awkwardly at the top. Only for fresh scratch projects,
                and not when the curation transcript already opened the conversation. */}
            {workspace.mode === "SCRATCH" && !showIntakeTranscript && (
              <div className="flex justify-start gap-2.5">
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-panel2">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                </span>
                <div className="w-full max-w-[88%]">
                  <div className="whitespace-pre-wrap rounded-2xl border border-border bg-panel2 px-4 py-2.5 text-sm leading-relaxed text-txt">
                    {modeGreeting(workspace).title} {modeGreeting(workspace).body}
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              // The idea already shows in the curation transcript above — don't
              // repeat it as the first user bubble.
              if (showIntakeTranscript && i === 0 && m.role === "user" && stripBrief(m.content).trim() === intakeIdea.trim()) {
                return null;
              }
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
                      {m.role === "assistant" ? <Markdown content={m.content} /> : m.content}
                      {m.aiText && (
                        <div className="mt-1.5 border-t border-border/60 pt-1.5">
                          <button
                            type="button"
                            onClick={() => setOpenDetails((cur) => (cur === i ? null : i))}
                            className="inline-flex items-center gap-1 text-[11px] text-txt3 transition-colors hover:text-txt2"
                          >
                            <ChevronDown className={cn("h-3 w-3 transition-transform", openDetails === i && "rotate-180")} />
                            {openDetails === i ? "Hide details" : "Details"}
                          </button>
                          {openDetails === i && (
                            <div className="mt-1 text-[13px] leading-relaxed text-txt2">
                              <Markdown content={m.aiText} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* The turn's step feed, kept on the message (collapsible,
                        open by default) so the detail doesn't vanish when the
                        turn ends. */}
                    {m.role === "assistant" && m.worklog && m.worklog.length > 0 && (
                      <details className="group mt-2 pl-1" open>
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] text-txt3 transition-colors hover:text-txt2">
                          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                          {m.worklog.length} steps
                        </summary>
                        <div className="scroll-area mt-1 max-h-44 overflow-y-auto rounded-lg border border-border/60 bg-panel2/40 px-3 py-1.5">
                          {m.worklog.map((step, k) => (
                            <div key={k} className="flex items-center gap-1.5 py-0.5 text-[11px] text-txt3">
                              <Check className="h-3 w-3 shrink-0 text-ok/70" strokeWidth={2.4} />
                              <span className="font-mono">{step}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
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
                    {labels.length > 0 && !(m.worklog && m.worklog.length > 0) && (
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
                  <div className="max-w-[85%] rounded-2xl border border-accent/25 bg-hl px-4 py-2.5 text-sm text-txt">
                    <Markdown content={streaming} />
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
          className="flex items-end gap-2 border-t border-border p-3"
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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter makes a newline (so longer prompts are easy).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
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
                      : workspace.kind === "game"
                        ? "Describe the game you want built…"
                        : "Describe the app you want built…"
            }
            className="scroll-area max-h-[40vh] min-h-[60px] flex-1 resize-none rounded-xl border border-border bg-bg2 px-4 py-2.5 text-sm leading-relaxed text-txt placeholder:text-txt3 focus:border-accent focus:outline-none disabled:opacity-60"
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
