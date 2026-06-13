"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  ArrowUp,
  Loader2,
  Sparkles,
  AppWindow,
  Gamepad2,
  Footprints,
  Rabbit,
  Joystick,
  Map as MapIcon,
  Globe,
  Blocks,
  Brain,
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { GAME_CATEGORIES, GAME_ENGINES } from "@/lib/templates/engines";
import { cn } from "@/lib/utils";

/* Lovable-style start page: one prompt, zero friction. Pick App or Game (the
 * two agents); for a game, pick a kid-language category — the engine is chosen
 * invisibly server-side. Submit → guest session if needed → SCRATCH workspace →
 * /build/[id] runs the first turn. */

interface BuildLandingProps {
  signedIn: boolean;
  isGuest: boolean;
  dbReady: boolean;
  /** Admins/testers see a quiet engine-override control (students never do). */
  isAdmin: boolean;
}

type BuildKind = "app" | "game" | "lab";

const KINDS: { id: BuildKind; label: string; icon: typeof AppWindow; blurb: string }[] = [
  { id: "app", label: "App", icon: AppWindow, blurb: "Sites, tools & dashboards" },
  { id: "game", label: "Game", icon: Gamepad2, blurb: "Build, play & share" },
  { id: "lab", label: "AI Lab", icon: Brain, blurb: "Learn AI & train models" },
];

/** Lucide icon for each game category (keyed by the icon string in engines.ts). */
const CATEGORY_ICONS: Record<string, typeof AppWindow> = {
  Footprints,
  Rabbit,
  Joystick,
  Map: MapIcon,
  Globe,
  Blocks,
  Sparkles,
};

const WEB_PLACEHOLDER = "An app that tracks my reading list, with covers, ratings and a stats page…";
const WEB_SUGGESTIONS = [
  "A pomodoro timer with daily stats",
  "Landing page for a specialty coffee brand",
  "Kanban board with drag and drop",
  "Personal portfolio with project gallery",
  "Expense splitter for trips with friends",
  "Markdown note-taking app",
];

/** A short workspace name from the first words of the prompt. */
function nameFromPrompt(prompt: string): string {
  const words = prompt.trim().replace(/\s+/g, " ").split(" ").slice(0, 6).join(" ");
  const name = words.length > 48 ? `${words.slice(0, 48)}…` : words;
  return name || "New project";
}

export function BuildLanding({ signedIn, isGuest, dbReady, isAdmin }: BuildLandingProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<BuildKind>("app");
  // For games: the selected category card (defaults to "My Own Idea").
  const [gameCat, setGameCat] = useState<string>("own");
  // Admin/tester engine override ("" = Auto). Only sent for games.
  const [engine, setEngine] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeCat = GAME_CATEGORIES.find((c) => c.id === gameCat) ?? GAME_CATEGORIES[0];
  const placeholder = kind === "game" ? activeCat.placeholder : WEB_PLACEHOLDER;
  const suggestions = kind === "game" ? activeCat.suggestions : WEB_SUGGESTIONS;

  // One step, no friction: a guest session if needed → create the workspace
  // (the server silently picks + scaffolds the right starter) → hand the prompt
  // to the builder, which fires the first turn on load. The engine is invisible.
  async function start(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!signedIn && !isGuest) {
        const res = await signIn("guest", { redirect: false });
        if (res?.error) throw new Error("Couldn't start a guest session — try again or sign in.");
      }
      const body: Record<string, unknown> = {
        mode: "SCRATCH",
        name: nameFromPrompt(trimmed),
        prompt: trimmed,
        buildKind: kind,
      };
      if (kind === "game") {
        body.gameCategory = gameCat;
        if (isAdmin && engine) body.engineOverride = engine;
      }
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? "Couldn't create your project — try again.");
      }
      sessionStorage.setItem(`helix.build.${json.data.id}`, trimmed);
      if (kind === "game") {
        // The Godot "Game Studio" path uses a different brief (real engine,
        // compiled — no live preview); everything else is an instant game.
        const isGodot = gameCat === "studio" || (isAdmin && engine === "godot");
        sessionStorage.setItem(`helix.build.mode.${json.data.id}`, isGodot ? "godot" : "game");
      }
      router.push(`/build/${json.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
      setBusy(false);
    }
  }

  // The AI Lab isn't a prompt-built project — just ensure a session and go.
  async function enterLab() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!signedIn && !isGuest) {
        const res = await signIn("guest", { redirect: false });
        if (res?.error) throw new Error("Couldn't start a session — try again or sign in.");
      }
      router.push("/lab");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#070b12] text-[#f8fbff]">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_480px_at_50%_-10%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent),radial-gradient(700px_420px_at_85%_110%,color-mix(in_srgb,#c084fc_13%,transparent),transparent),radial-gradient(500px_300px_at_8%_100%,color-mix(in_srgb,#00ffd1_9%,transparent),transparent)]" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center gap-3 px-6 py-4">
        <Link href="/welcome" className="flex items-center gap-2.5">
          <span className="overflow-hidden rounded-[10px]">
            <BrandMark size={30} />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">
            HELIX <span className="font-semibold text-[#9cadc4]">STUDIO</span>
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-2 text-[13px]">
          {signedIn ? (
            <Link href="/editor" className="rounded-[9px] border border-[#28364f] px-3.5 py-1.5 text-[#9cadc4] transition-colors hover:border-accent hover:text-[#f8fbff]">
              My projects
            </Link>
          ) : (
            <>
              <Link href="/login" className="px-3 py-1.5 text-[#9cadc4] transition-colors hover:text-[#f8fbff]">
                Sign in
              </Link>
              <Link href="/signup" className="rounded-[9px] border border-[#28364f] px-3.5 py-1.5 text-[#9cadc4] transition-colors hover:border-accent hover:text-[#f8fbff]">
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-24">
        <div className="mb-5 flex items-center gap-2 rounded-full border border-[#28364f] bg-[color-mix(in_srgb,#0d1626_72%,transparent)] px-3.5 py-1.5 text-xs text-[#9cadc4]">
          <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
          Idea → working app or game, with a live preview while it builds
        </div>

        <h1 className="max-w-[720px] text-center text-[clamp(34px,6vw,58px)] font-extrabold leading-[1.06] tracking-tight">
          What do you want to{" "}
          <span className="bg-gradient-to-r from-[#00ffd1] via-accent to-[#c084fc] bg-clip-text text-transparent">
            build
          </span>
          ?
        </h1>
        <p className="mt-4 max-w-[520px] text-center text-[15px] leading-relaxed text-[#9cadc4]">
          Describe it in a sentence. Helix plans it, writes the code, and shows you it live —
          then keep refining it in plain English.
        </p>

        {/* App vs Game — the two agents */}
        <div className="mt-7 flex items-center justify-center gap-2.5" role="group" aria-label="What to build">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const active = kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={active}
                disabled={busy}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left transition-colors disabled:opacity-50",
                  active
                    ? "border-accent bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[#f8fbff]"
                    : "border-[#1d2940] bg-[color-mix(in_srgb,#0d1626_60%,transparent)] text-[#9cadc4] hover:border-accent hover:text-[#f8fbff]",
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "text-accent" : "")} strokeWidth={1.8} />
                <span className="flex flex-col leading-tight">
                  <span className="text-[14px] font-semibold">{k.label}</span>
                  <span className="text-[10.5px] text-[#5f6f86]">{k.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Game categories — pick what kind of game (the engine is invisible) */}
        {kind === "game" && (
          <div className="mt-4 w-full max-w-[680px]">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Kind of game">
              {GAME_CATEGORIES.filter((c) => !c.adminOnly || isAdmin).map((c) => {
                const Icon = CATEGORY_ICONS[c.icon] ?? Sparkles;
                const active = gameCat === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setGameCat(c.id)}
                    aria-pressed={active}
                    disabled={busy}
                    className={cn(
                      "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50",
                      active
                        ? "border-accent bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[#f8fbff]"
                        : "border-[#1d2940] bg-[color-mix(in_srgb,#0d1626_60%,transparent)] text-[#9cadc4] hover:border-accent hover:text-[#f8fbff]",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-accent" : "")} strokeWidth={1.8} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-[12.5px] font-semibold">{c.label}</span>
                      <span className="truncate text-[10.5px] text-[#5f6f86]">{c.example}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Engine override — admins/testers only; invisible to students */}
            {isAdmin && (
              <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-[#5f6f86]">
                <label htmlFor="engine-override">Engine</label>
                <select
                  id="engine-override"
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                  disabled={busy}
                  className="rounded-md border border-[#1d2940] bg-[#0d1626] px-2 py-1 text-[11px] text-[#9cadc4] outline-none focus:border-accent"
                >
                  <option value="">Auto</option>
                  {GAME_ENGINES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* AI Lab — no prompt; step into the guided learning surface */}
        {kind === "lab" && (
          <div className="mt-6 w-full max-w-[540px] text-center">
            <p className="text-[14px] leading-relaxed text-[#9cadc4]">
              Train your own AI models and learn how they think — hands-on, step by step, no code.
            </p>
            <button
              onClick={() => void enterLab()}
              disabled={busy || !dbReady}
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[12px] border-none bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              Enter the AI Lab
            </button>
          </div>
        )}

        {/* Prompt box */}
        {kind !== "lab" && (
        <div
          className={cn(
            "mt-4 w-full max-w-[680px] rounded-2xl border bg-[color-mix(in_srgb,#0d1626_88%,transparent)] shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur transition-colors",
            busy ? "border-[#28364f]" : "border-[#28364f] focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent),0_18px_60px_rgba(0,0,0,0.45)]"
          )}
        >
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && dbReady) {
                e.preventDefault();
                start(prompt);
              }
            }}
            disabled={busy}
            rows={3}
            placeholder={placeholder}
            aria-label="Describe what you want to build"
            className="w-full resize-none border-none bg-transparent px-5 pt-4 font-sans text-[15px] leading-relaxed text-[#f8fbff] outline-none placeholder:text-[#5f6f86] disabled:opacity-60"
          />
          <div className="flex items-center gap-2 px-3.5 pb-3">
            <span className="text-[11.5px] text-[#5f6f86]">
              {signedIn ? "Builds into your workspace" : "No account needed — start free"}
            </span>
            <button
              onClick={() => start(prompt)}
              disabled={busy || !dbReady || prompt.trim().length === 0}
              aria-label="Start building"
              className="ml-auto grid h-9 w-9 cursor-pointer place-items-center rounded-[11px] border-none bg-accent text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.2} />}
            </button>
          </div>
        </div>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-[10px] border border-[color-mix(in_srgb,#f87171_40%,transparent)] bg-[color-mix(in_srgb,#f87171_10%,transparent)] px-4 py-2.5 text-[12.5px] text-[#fca5a5]">
            {error}
          </div>
        )}
        {!dbReady && (
          <div className="mt-4 rounded-[10px] border border-[#28364f] bg-[#0d1626] px-4 py-2.5 text-[12.5px] text-[#9cadc4]">
            The builder needs the database — it isn&apos;t connected in this deployment yet.
          </div>
        )}

        {/* Suggestions */}
        {kind !== "lab" && (
        <div className="mt-7 flex max-w-[680px] flex-wrap items-center justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setPrompt(s);
                inputRef.current?.focus();
              }}
              disabled={busy}
              className="cursor-pointer rounded-full border border-[#1d2940] bg-[color-mix(in_srgb,#0d1626_60%,transparent)] px-3.5 py-1.5 text-xs text-[#9cadc4] transition-colors hover:border-accent hover:text-[#f8fbff] disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        )}
      </main>

      <footer className="relative z-10 pb-6 text-center text-[11.5px] text-[#5f6f86]">
        Powered by the Helix agent — plan, build, review. helixstudio.org
      </footer>
    </div>
  );
}
