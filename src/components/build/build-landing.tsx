"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

/* Lovable-style start page: one prompt, zero friction. Submit → guest
 * session if needed → SCRATCH workspace → /build/[id] runs the first turn. */

interface BuildLandingProps {
  signedIn: boolean;
  isGuest: boolean;
  dbReady: boolean;
}

const SUGGESTIONS = [
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
  return name || "New app";
}

export function BuildLanding({ signedIn, isGuest, dbReady }: BuildLandingProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function start(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1. A session, without friction: visitors become guests in one call.
      if (!signedIn && !isGuest) {
        const res = await signIn("guest", { redirect: false });
        if (res?.error) throw new Error("Couldn't start a guest session — try again or sign in.");
      }

      // 2. An empty workspace for the agent to build in.
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "SCRATCH", name: nameFromPrompt(trimmed) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? "Couldn't create your project — try again.");
      }

      // 3. Hand the prompt to the builder; it fires the first turn on load.
      sessionStorage.setItem(`helix.build.${json.data.id}`, trimmed);
      router.push(`/build/${json.data.id}`);
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
          Idea → working app, with a live preview while it builds
        </div>

        <h1 className="max-w-[720px] text-center text-[clamp(34px,6vw,58px)] font-extrabold leading-[1.06] tracking-tight">
          What do you want to{" "}
          <span className="bg-gradient-to-r from-[#00ffd1] via-accent to-[#c084fc] bg-clip-text text-transparent">
            build
          </span>
          ?
        </h1>
        <p className="mt-4 max-w-[520px] text-center text-[15px] leading-relaxed text-[#9cadc4]">
          Describe it in a sentence. Helix plans it, writes the code, and shows you the app live —
          then keep refining it in plain English.
        </p>

        {/* Prompt box */}
        <div
          className={cn(
            "mt-9 w-full max-w-[680px] rounded-2xl border bg-[color-mix(in_srgb,#0d1626_88%,transparent)] shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur transition-colors",
            busy ? "border-[#28364f]" : "border-[#28364f] focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent),0_18px_60px_rgba(0,0,0,0.45)]"
          )}
        >
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                start(prompt);
              }
            }}
            disabled={busy}
            rows={3}
            placeholder="An app that tracks my reading list, with covers, ratings and a stats page…"
            aria-label="Describe the app you want to build"
            className="w-full resize-none border-none bg-transparent px-5 pt-4 font-sans text-[15px] leading-relaxed text-[#f8fbff] outline-none placeholder:text-[#5f6f86] disabled:opacity-60"
          />
          <div className="flex items-center gap-2 px-3.5 pb-3">
            <span className="text-[11.5px] text-[#5f6f86]">
              {signedIn ? "Builds into your workspace" : "No account needed — start free"}
            </span>
            <button
              onClick={() => start(prompt)}
              disabled={busy || prompt.trim().length === 0}
              aria-label="Start building"
              className="ml-auto grid h-9 w-9 cursor-pointer place-items-center rounded-[11px] border-none bg-accent text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.2} />}
            </button>
          </div>
        </div>

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
        <div className="mt-7 flex max-w-[680px] flex-wrap items-center justify-center gap-2">
          {SUGGESTIONS.map((s) => (
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
      </main>

      <footer className="relative z-10 pb-6 text-center text-[11.5px] text-[#5f6f86]">
        Powered by the Helix agent — plan, build, review. helixstudio.org
      </footer>
    </div>
  );
}
