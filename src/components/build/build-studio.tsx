"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Code2,
  Eye,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Sparkles,
  Play,
  Hammer,
} from "lucide-react";
import { BrandMark, HelixGlyph } from "@/components/brand";
import { Markdown } from "@/components/ui/markdown";
import { composePreviewHtml, pickPreviewEntry } from "@/lib/preview-html";
import { isGodotProject } from "@/lib/templates/engines";
import { scaffoldSteps } from "@/lib/scaffold-steps";
import { buildTasks } from "@/lib/build-tasks";
import { buildNarration, friendlyActivity, synthesizeReply, paraphraseRequest, holdingLines } from "@/lib/build-feed";
import { BuildBoard } from "@/components/build/build-board";
import { cn } from "@/lib/utils";

/* The Lovable-style builder: the agent writes the app while the right pane
 * previews it live. Rides entirely on the existing workspace machinery —
 * NDJSON chat turns (/chat), the file overlay (/files, /file), and the
 * shared static-preview composer. */

interface BuildStudioProps {
  workspace: { id: string; name: string };
  isGuest: boolean;
  /** The workspace was created from a starter template (already has files). */
  scaffolded?: boolean;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  /** The agent's activity log for the turn that produced this reply. */
  worklog?: string[];
  /** The model's raw reply, kept behind a "details" toggle when we showed our
   * own synthesized summary as the content (hybrid). */
  aiText?: string;
}

/* First-turn brief: the workspace is empty and the preview is a sandboxed
 * iframe, so steer the agent toward a no-build static app it can ship in
 * one turn — the same trick Lovable uses to guarantee an instant preview. */
const BUILD_BRIEF = `Build a complete, working web app in this empty workspace from the request below.
Constraints: static app only — index.html plus style.css and script.js (vanilla JavaScript; CDN libraries via <script> tags are fine). No build step, no server code: it must run inside a sandboxed iframe.
Quality bar: genuinely beautiful — modern type scale, generous spacing, a cohesive palette, hover/focus states, responsive layout. Implement real working functionality (persist with localStorage where it fits), not a mockup. Don't ask questions; make tasteful decisions and build it now.

Request: `;

/* When the workspace was scaffolded from a starter template, the stack and
 * config already exist — steer the agent to customize on top, not re-scaffold. */
const TEMPLATE_BRIEF = `This workspace is already scaffolded with the right stack for this idea (see PROJECT NOTES for the stack and key files). Build the request below ON TOP of it: read the existing files first, then customize and extend them. Do NOT recreate package.json/config or re-scaffold. Open your reply by briefly stating the stack you're building with (e.g. "Building this as a Next.js app…"). Implement real, working functionality with a polished UI. Don't ask questions; make tasteful decisions and build it now.

Request: `;

/* Game build mode: the workspace is scaffolded from a game starter (Phaser for
 * 2D, Babylon.js for 3D, loaded from a CDN). Steer toward a genuinely playable
 * game while keeping the no-module / no-build constraints the preview needs. */
const GAME_BRIEF = `This workspace is already scaffolded with a game starter (see PROJECT NOTES for the library and files — Phaser for 2D, Babylon.js for 3D, loaded from a CDN). Build the request below into a complete, PLAYABLE browser game by editing the existing game.js (and style.css). Read the existing files first. Keep the CDN <script> and use the global library — do NOT switch to ES module imports or add a build step (the preview inlines local scripts and strips module type). Make it genuinely fun: a clear goal, responsive controls, a real game loop, collisions/scoring where they fit, a way to win or lose and restart, and a little juice (motion, color, feedback). Use the library's built-in shapes/graphics for sprites — there are no image assets. Don't ask questions; make tasteful decisions and build it now.

Request: `;

/* Godot "Game Studio" mode: a real engine project compiled on demand (Build &
 * Play). The agent authors GDScript + scenes; it must NOT touch the export. */
const GODOT_BRIEF = `This workspace is a real Godot 4 project (project.godot + main.tscn + main.gd + export_presets.cfg). Build the request below into a complete, playable game by editing the GDScript (.gd) and scenes (.tscn). Read the existing files first. Use Godot's built-in nodes and procedural shapes (ColorRect, Polygon2D, MeshInstance3D, etc.) — there are NO imported image/model assets. GDScript uses TAB indentation; built-in input actions ui_left/ui_right/ui_up/ui_down/ui_accept work without input-map setup. Do NOT edit export_presets.cfg or rename project.godot — the project is compiled to the web on the server. There is no live preview; the user presses Build & Play to compile and run. Make it genuinely fun: a clear goal, responsive controls, and a way to win or lose. Don't ask questions; make tasteful decisions and build it now.

Request: `;

const FOLLOW_UPS = ["Add a dark mode toggle", "Make it feel more premium", "Improve the mobile layout"];

/** The first turn's stored message carries a build brief prefix; show only the
 * user's actual prompt when rehydrating the conversation. */
function stripBrief(content: string): string {
  const marker = "\n\nRequest: ";
  const i = content.lastIndexOf(marker);
  return i >= 0 ? content.slice(i + marker.length) : content;
}

export function BuildStudio({ workspace, isGuest, scaffolded = false }: BuildStudioProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  // Truthful "scaffolding…" checklist shown over the first-turn latency on a
  // freshly-scaffolded project (derived from the real injected files).
  const [setupSteps, setSetupSteps] = useState<string[]>([]);
  const realActivityStarted = useRef(false);
  // Live "construction feed" (shared with the editor): narrate the just-injected
  // starter template as paced "building …" lines so the chat stays alive while
  // the agent customizes it. turnDone stops the feed the moment the turn lands.
  const feedActive = useRef(false);
  const turnDone = useRef(false);
  const [building, setBuilding] = useState(false);

  // Live build board — scoped to the INITIAL build turn (a follow-up edit must
  // not reset a completed board). Cards come from the scaffold's MVC structure;
  // these signals (real writes + activity) drive the flow. Token-free.
  const [boardTasks, setBoardTasks] = useState<string[]>([]);
  const [boardBuilding, setBoardBuilding] = useState(false);
  const [boardWrites, setBoardWrites] = useState(0);
  const [boardSteps, setBoardSteps] = useState(0);
  const [boardErrored, setBoardErrored] = useState(false);
  // Cards the board adds LIVE when the build reveals more work (verify/fix/test).
  // The session id bumps per build so appended cards don't reset the flow.
  const [boardSession, setBoardSession] = useState(0);
  const [boardDetected, setBoardDetected] = useState<string[]>([]);
  const detectedKinds = useRef<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [openDetails, setOpenDetails] = useState<number | null>(null); // message id with expanded "what the model said"

  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  // Left column switches between the conversation and the live build board.
  const [chatTab, setChatTab] = useState<"chat" | "board">("chat");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string | null>(null);

  // Godot ("Game Studio") projects compile on demand — no live srcDoc preview.
  const [godotStatus, setGodotStatus] = useState<"none" | "exporting" | "ready" | "error">("none");
  const [godotBuildId, setGodotBuildId] = useState<string | null>(null);
  const [godotBuilding, setGodotBuilding] = useState(false);
  const [godotLog, setGodotLog] = useState<string[]>([]);
  const [godotError, setGodotError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const kicked = useRef(false);
  const composeSeq = useRef(0);
  // Trailing-edge debounce for the live preview: a 20-file build fires 20 write
  // activities, but we only need to re-compose the preview once they settle.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while THIS session is running a turn — so the resume poller backs off
  // and doesn't fight the live stream.
  const localTurn = useRef(false);

  /* ----------------------------- preview ---------------------------- */

  const fetchFile = useCallback(
    async (path: string): Promise<string | null> => {
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/file?path=${encodeURIComponent(path)}`);
        const json = await res.json().catch(() => null);
        return res.ok && json?.ok ? (json.data.content as string) : null;
      } catch {
        return null;
      }
    },
    [workspace.id],
  );

  const refreshPreview = useCallback(async () => {
    const seq = ++composeSeq.current;
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/files`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || seq !== composeSeq.current) return;
      const paths = (json.data.files as Array<{ path: string }>).map((f) => f.path);
      setFilePaths(paths);

      const entry = pickPreviewEntry(paths);
      if (!entry) return;
      const composed = await composePreviewHtml(entry, fetchFile);
      if (seq !== composeSeq.current || !composed) return;
      setPreviewHtml(composed.html);
      setPreviewNonce((n) => n + 1);
    } catch {
      // transient — the next refresh catches up
    }
  }, [workspace.id, fetchFile]);

  /* --------------------------- godot build -------------------------- */

  // Latest build status (so a revisit knows whether there's a playable build).
  const refreshGodotStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/godot/build`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;
      setGodotStatus(json.data.status ?? "none");
      setGodotBuildId(json.data.buildId ?? null);
      if (json.data.error) setGodotError(json.data.error);
    } catch {
      /* ignore */
    }
  }, [workspace.id]);

  // Compile the Godot project, streaming the log, then play the fresh build.
  const buildAndPlay = useCallback(async () => {
    if (godotBuilding) return;
    setGodotBuilding(true);
    setGodotStatus("exporting");
    setGodotError(null);
    setGodotLog(["Starting the build…"]);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/godot/build`, { method: "POST" });
      if (!res.body) throw new Error("The build couldn't start.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let buildId: string | null = null;
      let ok = false;
      let errMsg: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { type: string; line?: string; ok?: boolean; buildId?: string; error?: string };
            if (evt.type === "log" && evt.line) setGodotLog((prev) => [...prev, evt.line!]);
            else if (evt.type === "done") {
              ok = Boolean(evt.ok);
              buildId = evt.buildId ?? null;
              errMsg = evt.error ?? null;
            }
          } catch {
            /* ignore malformed line */
          }
        }
      }
      if (ok) {
        setGodotStatus("ready");
        if (buildId) setGodotBuildId(buildId);
        setTab("preview");
      } else {
        setGodotStatus("error");
        setGodotError(errMsg ?? "The build failed.");
      }
    } catch (e) {
      setGodotStatus("error");
      setGodotError(e instanceof Error ? e.message : "The build failed.");
    } finally {
      setGodotBuilding(false);
    }
  }, [workspace.id, godotBuilding]);

  // When a Godot project is detected, fetch its build status once.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set post-await, not synchronously
    if (isGodotProject(filePaths)) void refreshGodotStatus();
  }, [filePaths, refreshGodotStatus]);

  /* ----------------------------- agent turn ------------------------- */

  // Play the friendly construction feed into the chat activity line from the
  // REAL scaffolded files — "Building the home page…", "Wiring up the
  // navigation…" — so the long model turn never reads as a frozen loader.
  const startBuildFeed = useCallback(
    (files: string[], idea: string, kind: "app" | "game") => {
      if (feedActive.current) return;
      feedActive.current = true;
      realActivityStarted.current = true; // the scaffold checklist bows out
      // Stored, seeded narration (varied per project, paced to the estimate).
      const { steps, holding, estimateMs } = buildNarration(files, { idea, kind, seed: workspace.id });
      const perStep = Math.max(700, Math.min(2600, Math.round(estimateMs / Math.max(4, steps.length))));
      const seq = [...steps, ...holding];
      void (async () => {
        for (let i = 0; i < seq.length; i++) {
          if (turnDone.current) return;
          // Append (so real verify/test lines can interleave via friendlyActivity).
          setActivities((a) => (turnDone.current ? a : [...a, seq[i]]));
          const concrete = i < steps.length;
          await new Promise((r) => setTimeout(r, (concrete ? perStep : 2600) + Math.random() * (concrete ? 300 : 1400)));
        }
      })();
    },
    [workspace.id],
  );

  // Follow-up requests on an existing project: open with a paraphrase of what
  // they asked (never verbatim), then breathe with varied holding lines.
  const startFixFeed = useCallback(
    (message: string) => {
      if (feedActive.current) return;
      feedActive.current = true;
      realActivityStarted.current = true;
      const seed = `${workspace.id}:${message}`;
      const seq = [`${paraphraseRequest(message, seed)}…`, ...holdingLines(seed)];
      void (async () => {
        for (let i = 0; i < seq.length; i++) {
          if (turnDone.current) return;
          setActivities((a) => (turnDone.current ? a : [...a, seq[i]]));
          await new Promise((r) => setTimeout(r, 1100 + Math.random() * 900));
        }
      })();
    },
    [workspace.id],
  );

  const send = useCallback(
    async (text: string, brief: "static" | "template" | "game" | "godot" | "none" = "none") => {
      const trimmed = text.trim();
      if (!trimmed) return;
      localTurn.current = true;
      realActivityStarted.current = false;
      feedActive.current = false;
      turnDone.current = false;
      setMessages((prev) => [...prev, { id: nextId.current++, role: "user", content: trimmed }]);
      setActivities([]);
      setSetupSteps([]); // scaffold checklist is first-turn only
      setError(null);
      setBuilding(true);

      // The build board tracks the INITIAL build only (brief !== "none").
      const isInitialBuild = brief !== "none";
      // A follow-up edit has no scaffold event, so kick the paraphrased fix feed
      // now; an initial build waits for the scaffold event → construction feed.
      if (!isInitialBuild) startFixFeed(trimmed);
      if (isInitialBuild) {
        setBoardTasks(buildTasks(filePaths));
        setBoardBuilding(true);
        setBoardWrites(0);
        setBoardSteps(0);
        setBoardErrored(false);
        setBoardDetected([]);
        detectedKinds.current = new Set();
        setBoardSession((n) => n + 1);
      }

      // The brief is a MODEL-only instruction — send it separately so only the
      // user's clean request is persisted/shown (never leaks into the editor).
      const prefix =
        brief === "static"
          ? BUILD_BRIEF
          : brief === "godot"
            ? GODOT_BRIEF
            : brief === "game"
              ? GAME_BRIEF
              : brief === "template"
                ? TEMPLATE_BRIEF
                : "";
      let turnLog: string[] = [];
      // Watchdog: never let the chat hang forever if a turn stops reporting back.
      const ctl = new AbortController();
      const watchdog = setTimeout(() => ctl.abort(), 315_000);
      let resolved = false;
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, brief: prefix || undefined, mode: "build" }),
          signal: ctl.signal,
        });

        if (!res.headers.get("content-type")?.includes("application/x-ndjson")) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error?.message ?? `The agent couldn't start (${res.status}).`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const consume = (line: string) => {
          if (!line.trim()) return;
          let evt: {
            type: string;
            label?: string;
            text?: string;
            message?: string;
            code?: string;
            files?: string[];
            changes?: { written: string[]; deleted: string[] };
            verify?: { status: "passed" | "failed" | "skipped"; command?: string };
          };
          try {
            evt = JSON.parse(line);
          } catch {
            return;
          }
          if (evt.type === "scaffold") {
            // New project: the starter template landed — play the live feed from
            // its real files (the board + preview still react to writes below).
            const files = (evt as unknown as { files?: string[] }).files ?? [];
            startBuildFeed(files, trimmed, brief === "game" || brief === "godot" ? "game" : "app");
          } else if (evt.type === "activity" && evt.label) {
            // Real agent work has begun — let the scaffold checklist stop.
            realActivityStarted.current = true;
            turnLog = [...turnLog, evt.label]; // raw labels feed the final worklog
            // While the stored feed plays it owns the chat display: rephrase real
            // labels into the same voice (verify → "Running a quick test…") and
            // append; drop the noisy file-write labels. The board + preview still
            // advance off the raw labels below.
            if (feedActive.current) {
              const friendly = friendlyActivity(evt.label, workspace.id);
              if (friendly) setActivities((a) => [...a, friendly]);
            } else {
              setActivities(turnLog);
            }
            if (isInitialBuild) {
              setBoardSteps((s) => s + 1);
              // The board reacts to what the build reveals: real verify/fix/test
              // activity appends a new card, so completion now needs more steps.
              const lc = evt.label.toLowerCase();
              const detections: [RegExp, string][] = [
                [/verif/, "Verify the build"],
                [/\bfix|repair|debug|resolve/, "Fix issues found"],
                [/\btest|spec\b/, "Run tests"],
                [/install|dependenc/, "Install dependencies"],
              ];
              for (const [re, title] of detections) {
                if (re.test(lc) && !detectedKinds.current.has(title)) {
                  detectedKinds.current.add(title);
                  setBoardTasks((t) => [...t, title]);
                  setBoardDetected((d) => [...d, title]);
                }
              }
            }
            // The app takes shape live: refresh the preview as files land, and
            // feed the board a real write signal so cards advance for real.
            if (/^(wrote|deleted)/.test(evt.label)) {
              if (isInitialBuild) setBoardWrites((w) => w + 1);
              if (refreshTimer.current) clearTimeout(refreshTimer.current);
              refreshTimer.current = setTimeout(() => void refreshPreview(), 400);
            }
          } else if (evt.type === "delta") {
            feedActive.current = false; // the real reply is arriving — stop the feed
            turnDone.current = true;
          } else if (evt.type === "final") {
            resolved = true;
            turnDone.current = true;
            feedActive.current = false;
            // Hybrid: write our own varied, truthful summary from the real result;
            // keep the model's reply behind a "details" toggle.
            const synth = synthesizeReply({
              changes: evt.changes,
              verify: evt.verify,
              userMessage: trimmed,
              kind: brief === "game" || brief === "godot" ? "game" : "app",
              isFirstBuild: isInitialBuild,
              seed: workspace.id,
            });
            setMessages((prev) => [
              ...prev,
              {
                id: nextId.current++,
                role: "assistant",
                content: synth ?? evt.text ?? "Done.",
                worklog: turnLog,
                aiText: synth ? evt.text || undefined : undefined,
              },
            ]);
            setActivities([]);
            void refreshPreview();
          } else if (evt.type === "error") {
            resolved = true;
            turnDone.current = true;
            feedActive.current = false;
            if (evt.code === "GUEST_LIMIT") setLimitHit(true);
            setError(evt.message ?? "The agent hit an error — try again.");
            setActivities([]);
            if (isInitialBuild) setBoardErrored(true);
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            consume(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
          }
        }
        if (buffer) consume(buffer);
        // The stream closed without a result — surface it instead of leaving a
        // finished-looking feed with no reply.
        if (!resolved) {
          setError("The build didn't report back — reload in a moment to see the result, or try again.");
          if (isInitialBuild) setBoardErrored(true);
        }
      } catch (e) {
        setError(
          ctl.signal.aborted
            ? "This is taking longer than expected — the build may still be finishing in the background. Reload in a moment, or try again."
            : e instanceof Error
              ? e.message
              : "The agent hit an error — try again.",
        );
        setActivities([]);
        if (isInitialBuild) setBoardErrored(true);
      } finally {
        clearTimeout(watchdog);
        turnDone.current = true;
        feedActive.current = false;
        setBuilding(false);
        if (isInitialBuild) setBoardBuilding(false);
        localTurn.current = false;
      }
    },
    [workspace.id, refreshPreview, filePaths, startBuildFeed, startFixFeed],
  );

  /* ----------------------- persistence / resume -------------------- */

  // Reload the persisted conversation from the server (so the build page is
  // never wiped on return — the messages live in the DB).
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;
      const hist = (json.data.messages as Array<{ role: "user" | "assistant"; content: string }>).map((m) => ({
        id: nextId.current++,
        role: m.role,
        content: m.role === "user" ? stripBrief(m.content) : m.content,
      }));
      if (hist.length) setMessages(hist);
    } catch {
      // keep whatever's on screen
    }
  }, [workspace.id]);

  // If a build is still running server-side (started here, then navigated away
  // and back), pick the live activity back up from the progress channel and
  // reload the conversation when it lands.
  const resumeProgress = useCallback(async () => {
    let resumed = false;
    for (let i = 0; i < 300; i++) {
      if (localTurn.current) return; // a fresh local turn now owns the UI
      let label: string | null = null;
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/progress`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        label = json?.data?.label ?? null;
      } catch {
        /* transient — try again */
      }
      if (label) {
        resumed = true;
        setBuilding(true);
        setActivities([label]);
        await new Promise((r) => setTimeout(r, 1200));
      } else {
        if (resumed) {
          setBuilding(false);
          await loadHistory(); // the turn finished — show its reply
        }
        return;
      }
    }
  }, [workspace.id, loadHistory]);

  /* ------------------------- creation sequence ---------------------- */

  // Fill the first-turn warm-up with a paced, TRUE checklist built from the
  // files the engine actually scaffolded — it reads as genuine setup work and
  // dissolves into the agent's real activity log the moment that starts.
  const runCreationSequence = useCallback(async () => {
    realActivityStarted.current = false;
    let paths: string[] = [];
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/files`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) paths = (json.data.files as Array<{ path: string }>).map((f) => f.path);
    } catch {
      // No file list → skip the sequence; the agent's real log carries it.
    }
    // Now that we have the real scaffold, refine the board's cards from the
    // actual MVC structure (the kickoff seeded from an empty list).
    if (paths.length) setBoardTasks(buildTasks(paths));
    const { steps } = scaffoldSteps(paths);
    for (const step of steps) {
      if (realActivityStarted.current) break;
      setSetupSteps((prev) => [...prev, step]);
      // Randomized pacing so it feels alive, not scripted.
      await new Promise((r) => setTimeout(r, 360 + Math.floor(Math.random() * 640)));
    }
  }, [workspace.id]);

  /* ------------------------------ kickoff --------------------------- */

  // The landing page stashes the first prompt; fire it once on arrival.
  // Revisits (no stash) just load whatever the workspace already has.
  useEffect(() => {
    if (kicked.current) return;
    kicked.current = true;
    const t = setTimeout(() => {
      const stash = sessionStorage.getItem(`helix.build.${workspace.id}`);
      if (stash) {
        sessionStorage.removeItem(`helix.build.${workspace.id}`);
        // A game mode (set on the landing page) uses the game brief; otherwise
        // template vs. blank-static as before.
        const gameMode = sessionStorage.getItem(`helix.build.mode.${workspace.id}`);
        sessionStorage.removeItem(`helix.build.mode.${workspace.id}`);
        // Scaffolded projects get the genuine setup checklist over the warm-up.
        if (scaffolded) void runCreationSequence();
        const kickBrief =
          gameMode === "godot" ? "godot" : gameMode ? "game" : scaffolded ? "template" : "static";
        void send(stash, kickBrief);
      } else {
        // Revisit: restore the conversation + resume any in-flight build.
        void refreshPreview();
        void loadHistory();
        void resumeProgress();
      }
    }, 0);
    return () => clearTimeout(t);
  }, [workspace.id, send, refreshPreview, scaffolded, runCreationSequence, loadHistory, resumeProgress]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activities]);

  // Guests don't get background builds (premium only), so warn before a
  // tab-close/refresh while a build is running — their work would stop.
  useEffect(() => {
    if (!isGuest || !building) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isGuest, building]);

  // Code tab: load the selected file's content.
  useEffect(() => {
    if (tab !== "code") return;
    const path = selected ?? filePaths[0];
    if (!path) return;
    let cancelled = false;
    void fetchFile(path).then((content) => {
      if (!cancelled) setSelectedContent(content);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, selected, filePaths, fetchFile, previewNonce]);

  const activeCodePath = selected ?? filePaths[0] ?? null;
  const isGodot = isGodotProject(filePaths);
  const showEmptyPreview = !previewHtml;

  /* -------------------------------- UI ------------------------------ */

  return (
    <div className="flex h-screen min-h-0 flex-col bg-bg text-txt">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-bg2 px-4 py-2.5">
        <Link href="/build" className="flex items-center gap-2.5" title="Start another build">
          <span className="overflow-hidden rounded-[8px]">
            <BrandMark size={26} />
          </span>
        </Link>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">{workspace.name}</div>
        </div>
        <span
          className={cn(
            "ml-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px]",
            building
              ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-accent"
              : "border-[color-mix(in_srgb,var(--green)_35%,transparent)] text-ok",
          )}
        >
          {building ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" strokeWidth={2.4} />}
          {building ? "Building" : "Live"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isGuest && (
            <Link
              href="/login"
              className="hidden rounded-[9px] border border-[color-mix(in_srgb,var(--amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--amber)_9%,transparent)] px-3 py-1.5 text-[12px] text-warn sm:block"
            >
              Sign in to keep this app
            </Link>
          )}
          <Link
            href={`/editor/${workspace.id}`}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-border2 bg-panel px-3 py-1.5 text-[12px] text-txt2 transition-colors hover:border-accent hover:text-txt"
          >
            <Code2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Open in editor
          </Link>
        </div>
      </header>

      {/* Main split */}
      <div className="grid min-h-0 flex-1 grid-rows-[55vh_1fr] lg:grid-cols-[minmax(340px,420px)_1fr] lg:grid-rows-1">
        {/* Preview / code (first on mobile so the app is the hero) */}
        <section className="order-first flex min-h-0 flex-col bg-bg p-3 lg:order-last lg:p-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg2 shadow-[0_14px_50px_rgba(0,0,0,0.35)]">
            {/* Browser chrome */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
              <span className="flex gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-[#f87171]" />
                <i className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
                <i className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
              </span>
              <span className="ml-1 hidden min-w-0 flex-1 truncate rounded-md border border-border bg-panel px-2.5 py-1 text-center font-mono text-[11px] text-txt3 sm:block">
                {workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app"}
                .helix.app
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  title="Desktop preview"
                  onClick={() => setDevice("desktop")}
                  className={cn(
                    "grid h-7 w-7 cursor-pointer place-items-center rounded-md border-none bg-transparent",
                    device === "desktop" ? "text-accent" : "text-txt3 hover:text-txt",
                  )}
                >
                  <Monitor className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
                <button
                  title="Mobile preview"
                  onClick={() => setDevice("mobile")}
                  className={cn(
                    "grid h-7 w-7 cursor-pointer place-items-center rounded-md border-none bg-transparent",
                    device === "mobile" ? "text-accent" : "text-txt3 hover:text-txt",
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
                <button
                  title="Refresh preview"
                  onClick={() => void refreshPreview()}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border-none bg-transparent text-txt3 hover:text-txt"
                >
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
                <span className="mx-1 h-4 w-px bg-border" />
                <button
                  onClick={() => setTab("preview")}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-2.5 py-1.5 text-[11.5px]",
                    tab === "preview" ? "bg-panel2 text-txt" : "text-txt3 hover:text-txt",
                  )}
                >
                  <Eye className="h-3.5 w-3.5" strokeWidth={1.8} /> Preview
                </button>
                <button
                  onClick={() => setTab("code")}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-2.5 py-1.5 text-[11.5px]",
                    tab === "code" ? "bg-panel2 text-txt" : "text-txt3 hover:text-txt",
                  )}
                >
                  <Code2 className="h-3.5 w-3.5" strokeWidth={1.8} /> Code
                </button>
              </div>
            </div>

            {/* Pane body */}
            {tab === "preview" ? (
              isGodot ? (
                <div className="flex min-h-0 flex-1 flex-col bg-[#0b0f1a]">
                  {godotStatus === "ready" && godotBuildId ? (
                    <>
                      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg2 px-3 py-1.5">
                        <span className="text-[11.5px] text-txt3">Compiled game · Godot</span>
                        <button
                          onClick={() => void buildAndPlay()}
                          disabled={godotBuilding}
                          className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border2 bg-panel2 px-2.5 py-1 text-[11.5px] text-txt2 transition-colors hover:border-accent hover:text-txt disabled:opacity-50"
                        >
                          {godotBuilding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />}
                          Rebuild &amp; Play
                        </button>
                      </div>
                      <iframe
                        key={godotBuildId}
                        title="Play"
                        src={`/play/${workspace.id}?b=${godotBuildId}`}
                        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                        className="w-full min-h-0 flex-1 border-0 bg-black"
                      />
                    </>
                  ) : (
                    <div className="grid flex-1 place-items-center p-8">
                      <div className="w-full max-w-[460px] text-center">
                        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--brand-cyan,#00ffd1)] via-accent to-[#c084fc]">
                          <Play className="h-6 w-6 text-white" fill="currentColor" />
                        </div>
                        <div className="mt-4 text-[14px] font-semibold">
                          {godotBuilding ? "Compiling your game…" : "Ready to compile"}
                        </div>
                        <div className="mt-1.5 text-[12.5px] leading-relaxed text-txt2">
                          This is a real Godot project. Press Build &amp; Play to compile it and run it here.
                        </div>
                        <button
                          onClick={() => void buildAndPlay()}
                          disabled={godotBuilding}
                          className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[11px] border-none bg-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                        >
                          {godotBuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" fill="currentColor" />}
                          {godotBuilding ? "Building…" : "Build & Play"}
                        </button>
                        {godotError && !godotBuilding && (
                          <div className="mt-3 rounded-[10px] border border-[color-mix(in_srgb,#f87171_40%,transparent)] bg-[color-mix(in_srgb,#f87171_10%,transparent)] px-3 py-2 text-[12px] text-[#fca5a5]">
                            {godotError}
                          </div>
                        )}
                        {(godotBuilding || godotLog.length > 1) && (
                          <pre className="scroll-area mt-4 max-h-[200px] overflow-auto rounded-[10px] border border-border bg-[#070b12] p-3 text-left font-mono text-[11px] leading-[1.5] text-txt2">
                            {godotLog.join("\n")}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : showEmptyPreview ? (
                <div className="grid flex-1 place-items-center p-8">
                  <div className="text-center">
                    <div
                      className={cn(
                        "mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--brand-cyan,#00ffd1)] via-accent to-[#c084fc]",
                        building && "helix-thinking",
                      )}
                    >
                      <HelixGlyph size={26} />
                    </div>
                    <div className="mt-4 text-[14px] font-semibold">
                      {building ? "Helix is building your app" : "Nothing to preview yet"}
                    </div>
                    <div className="mt-1.5 max-w-[300px] text-[12.5px] leading-relaxed text-txt2">
                      {building
                        ? activities[activities.length - 1] ?? setupSteps[setupSteps.length - 1] ?? "warming up…"
                        : "Describe what you want in the chat and the app appears here as it's written."}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={cn("min-h-0 flex-1", device === "mobile" && "grid place-items-center bg-panel p-4")}>
                  <iframe
                    key={previewNonce}
                    title="Live preview"
                    sandbox="allow-scripts"
                    srcDoc={previewHtml}
                    className={cn(
                      "h-full w-full bg-white",
                      device === "mobile" &&
                        "h-[640px] max-h-full w-[390px] rounded-[18px] border border-border2 shadow-2xl",
                    )}
                  />
                </div>
              )
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-[170px_1fr]">
                <div className="scroll-area overflow-auto border-r border-border p-2">
                  {filePaths.length === 0 && <div className="px-2 py-1 text-[11.5px] text-txt3">No files yet</div>}
                  {filePaths.map((p) => (
                    <button
                      key={p}
                      onClick={() => setSelected(p)}
                      className={cn(
                        "block w-full cursor-pointer truncate rounded-md border-none px-2 py-1 text-left font-mono text-[11.5px]",
                        p === activeCodePath ? "bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-txt" : "bg-transparent text-txt2 hover:bg-panel2",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <pre className="scroll-area m-0 min-w-0 overflow-auto p-3.5 font-mono text-[12px] leading-[1.6] text-txt2">
                  {selectedContent ?? "Select a file."}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* Chat / build timeline */}
        <section className="flex min-h-0 flex-col border-t border-border bg-bg2 lg:border-r lg:border-t-0">
          {/* Left-column tabs: the conversation, or the live build board. */}
          <div className="flex shrink-0 items-center gap-1 border-b border-border bg-bg2 px-2 py-1.5">
            {(["chat", "board"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setChatTab(t)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
                  chatTab === t ? "bg-panel2 text-txt" : "text-txt3 hover:text-txt",
                )}
              >
                {t === "chat" ? "Chat" : "Build plan"}
                {t === "board" && boardTasks.length > 0 && (
                  <span className="rounded-full bg-panel px-1.5 text-[10px] text-txt3">{boardTasks.length}</span>
                )}
                {t === "board" && boardBuilding && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="building" />
                )}
              </button>
            ))}
          </div>

          {chatTab === "board" ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <BuildBoard
                tasks={boardTasks}
                sessionId={boardSession}
                detected={boardDetected}
                building={boardBuilding}
                writes={boardWrites}
                steps={boardSteps}
                errored={boardErrored}
              />
            </div>
          ) : (
          <div ref={bodyRef} className="scroll-area flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
            {messages.length === 0 && !building && (
              <div className="rounded-[10px] border border-border2 bg-panel px-3.5 py-3 text-[12.5px] leading-relaxed text-txt2">
                <Sparkles className="mb-1.5 h-4 w-4 text-accent" strokeWidth={1.8} />
                Tell Helix what to build or change — it writes the code and the preview updates live.
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className="flex gap-2.5 text-[13px]">
                <div
                  className={cn(
                    "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-[10px] font-bold text-white",
                    m.role === "user"
                      ? "bg-gradient-to-br from-[#8b5cf6] to-accent"
                      : "bg-gradient-to-br from-accent to-[color-mix(in_srgb,var(--accent)_55%,#000)]",
                  )}
                >
                  {m.role === "user" ? "Y" : <HelixGlyph size={12} />}
                </div>
                <div className="min-w-0 flex-1">
                  {m.role === "assistant" ? (
                    <>
                      {m.worklog && m.worklog.length > 0 && (
                        <div className="mb-2 rounded-[9px] border border-border2 bg-panel px-3 py-2">
                          {m.worklog.map((step, i) => (
                            <div key={i} className="flex items-center gap-2 py-0.5 text-[11.5px] text-txt2">
                              <Check className="h-3 w-3 shrink-0 text-ok" strokeWidth={2.4} />
                              {step}
                            </div>
                          ))}
                        </div>
                      )}
                      <Markdown content={m.content} />
                      {m.aiText && (
                        <div className="mt-1.5 border-t border-border2/60 pt-1.5">
                          <button
                            type="button"
                            onClick={() => setOpenDetails((cur) => (cur === m.id ? null : m.id))}
                            className="inline-flex items-center gap-1 text-[11px] text-txt3 transition-colors hover:text-txt2"
                          >
                            <ChevronDown className={cn("h-3 w-3 transition-transform", openDetails === m.id && "rotate-180")} />
                            {openDetails === m.id ? "Hide details" : "Details"}
                          </button>
                          {openDetails === m.id && (
                            <div className="mt-1 text-[12.5px] leading-relaxed text-txt2">
                              <Markdown content={m.aiText} />
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="whitespace-pre-wrap text-txt2">{m.content}</div>
                  )}
                </div>
              </div>
            ))}

            {building && (
              <div className="flex gap-2.5 text-[13px]">
                <div className="helix-thinking grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-gradient-to-br from-[var(--brand-cyan,#00ffd1)] via-accent to-[#c084fc]">
                  <HelixGlyph size={12} />
                </div>
                <div className="min-w-0 flex-1 rounded-[9px] border border-border2 bg-panel px-3 py-2">
                  {(() => {
                    // Scaffold checklist first (real, ticked), then the agent's
                    // live activity — the last line of whichever is active spins.
                    const steps = [...setupSteps, ...activities];
                    if (steps.length === 0) {
                      return (
                        <div className="flex items-center gap-2 py-0.5 text-[11.5px] text-txt3">
                          <Loader2 className="h-3 w-3 animate-spin" /> thinking…
                        </div>
                      );
                    }
                    return steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5 text-[11.5px] text-txt2">
                        {i === steps.length - 1 ? (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
                        ) : (
                          <Check className="h-3 w-3 shrink-0 text-ok" strokeWidth={2.4} />
                        )}
                        {step}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-[9px] border border-[color-mix(in_srgb,var(--red)_40%,transparent)] bg-[color-mix(in_srgb,var(--red)_9%,transparent)] px-3 py-2.5 text-[12px] text-bad">
                {error}
                {limitHit && (
                  <Link
                    href="/login"
                    className="ml-2 inline-block rounded-md border border-border2 bg-panel px-2 py-0.5 text-[11.5px] text-txt2 hover:text-txt"
                  >
                    Sign in free
                  </Link>
                )}
              </div>
            )}
          </div>
          )}

          {/* Composer */}
          <div className="shrink-0 border-t border-border p-3">
            {isGuest && building && (
              <div className="mb-2 rounded-[9px] border border-[color-mix(in_srgb,var(--amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-3 py-2 text-[11.5px] text-warn">
                Heads up — guest builds stop if you leave this page.{" "}
                <Link href="/login" className="font-medium text-accent hover:underline">
                  Sign in &amp; upgrade
                </Link>{" "}
                to keep builds running in the background.
              </div>
            )}
            {messages.length > 0 && !building && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {FOLLOW_UPS.map((f) => (
                  <button
                    key={f}
                    onClick={() => void send(f)}
                    className="cursor-pointer rounded-full border border-border bg-panel px-2.5 py-1 text-[11px] text-txt2 transition-colors hover:border-accent hover:text-txt"
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-[11px] border border-border2 bg-panel px-3 py-2.5 focus-within:border-accent">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!building && input.trim()) {
                      void send(input);
                      setInput("");
                    }
                  }
                }}
                rows={2}
                placeholder={
                  limitHit
                    ? "Guest allowance used — sign in to keep building"
                    : building
                      ? "Helix is building…"
                      : "Describe a change — “make the header sticky”…"
                }
                aria-label="Message Helix"
                disabled={building || limitHit}
                className="max-h-32 w-full resize-none border-none bg-transparent font-sans text-[13px] text-txt outline-none placeholder:text-txt3 disabled:opacity-60"
              />
              <button
                onClick={() => {
                  if (!building && !limitHit && input.trim()) {
                    void send(input);
                    setInput("");
                  }
                }}
                disabled={building || limitHit || input.trim().length === 0}
                aria-label="Send"
                className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[9px] border-none bg-accent text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.2} />}
              </button>
            </div>
            {isGuest && (
              <div className="mt-2 text-center text-[11px] text-txt3">
                Guest build —{" "}
                <Link href="/login" className="text-accent hover:underline">
                  sign in
                </Link>{" "}
                and this app transfers to your account automatically.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
