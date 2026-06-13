"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Check,
  Code2,
  Eye,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { BrandMark, HelixGlyph } from "@/components/brand";
import { Markdown } from "@/components/ui/markdown";
import { composePreviewHtml, pickPreviewEntry } from "@/lib/preview-html";
import { scaffoldSteps } from "@/lib/scaffold-steps";
import { buildTasks } from "@/lib/build-tasks";
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

const FOLLOW_UPS = ["Add a dark mode toggle", "Make it feel more premium", "Improve the mobile layout"];

export function BuildStudio({ workspace, isGuest, scaffolded = false }: BuildStudioProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  // Truthful "scaffolding…" checklist shown over the first-turn latency on a
  // freshly-scaffolded project (derived from the real injected files).
  const [setupSteps, setSetupSteps] = useState<string[]>([]);
  const realActivityStarted = useRef(false);
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

  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const kicked = useRef(false);
  const composeSeq = useRef(0);

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

  /* ----------------------------- agent turn ------------------------- */

  const send = useCallback(
    async (text: string, brief: "static" | "template" | "none" = "none") => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((prev) => [...prev, { id: nextId.current++, role: "user", content: trimmed }]);
      setActivities([]);
      setSetupSteps([]); // scaffold checklist is first-turn only
      setError(null);
      setBuilding(true);

      // The build board tracks the INITIAL build only (brief !== "none").
      const isInitialBuild = brief !== "none";
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

      const prefix = brief === "static" ? BUILD_BRIEF : brief === "template" ? TEMPLATE_BRIEF : "";
      let turnLog: string[] = [];
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prefix + trimmed, mode: "build" }),
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
          let evt: { type: string; label?: string; text?: string; message?: string; code?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            return;
          }
          if (evt.type === "activity" && evt.label) {
            // Real agent work has begun — let the scaffold checklist stop.
            realActivityStarted.current = true;
            turnLog = [...turnLog, evt.label];
            setActivities(turnLog);
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
              void refreshPreview();
            }
          } else if (evt.type === "final") {
            setMessages((prev) => [
              ...prev,
              { id: nextId.current++, role: "assistant", content: evt.text ?? "Done.", worklog: turnLog },
            ]);
            setActivities([]);
            void refreshPreview();
          } else if (evt.type === "error") {
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "The agent hit an error — try again.");
        setActivities([]);
        if (isInitialBuild) setBoardErrored(true);
      } finally {
        setBuilding(false);
        if (isInitialBuild) setBoardBuilding(false);
      }
    },
    [workspace.id, refreshPreview, filePaths],
  );

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
        // Scaffolded projects get the genuine setup checklist over the warm-up.
        if (scaffolded) void runCreationSequence();
        void send(stash, scaffolded ? "template" : "static");
      } else {
        void refreshPreview();
      }
    }, 0);
    return () => clearTimeout(t);
  }, [workspace.id, send, refreshPreview, scaffolded, runCreationSequence]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activities]);

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
              showEmptyPreview ? (
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

          {/* Composer */}
          <div className="shrink-0 border-t border-border p-3">
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
                placeholder={building ? "Helix is building…" : "Describe a change — “make the header sticky”…"}
                aria-label="Message Helix"
                disabled={building}
                className="max-h-32 w-full resize-none border-none bg-transparent font-sans text-[13px] text-txt outline-none placeholder:text-txt3 disabled:opacity-60"
              />
              <button
                onClick={() => {
                  if (!building && input.trim()) {
                    void send(input);
                    setInput("");
                  }
                }}
                disabled={building || input.trim().length === 0}
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

      {/* Live build tracker — floating, terminal-styled, read-only. */}
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
  );
}
