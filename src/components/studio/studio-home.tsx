"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  FolderGit2,
  FilePlus2,
  GitBranch,
  Loader2,
  MessageSquare,
  FileCode2,
  Lock,
  UploadCloud,
  Users,
  AppWindow,
  Gamepad2,
  Brain,
  Footprints,
  Rabbit,
  Joystick,
  Map as MapIcon,
  Globe,
  Blocks,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RepoPicker } from "@/components/studio/repo-picker";
import { GitHostPicker } from "@/components/studio/git-host-picker";
import { useWorkspaceCreation } from "@/components/studio/use-workspace-creation";
import { WorkspaceCardMenu } from "@/components/screens/workspace-card-menu";
import { GAME_CATEGORIES } from "@/lib/templates/engines";
import { PROVIDER_META, type GitProviderName } from "@/lib/git/meta";

interface WorkspaceCard {
  id: string;
  name: string;
  mode: "SCRATCH" | "IMPORT";
  kind: "app" | "game";
  repo: string | null;
  provider: string;
  updatedAt: string;
  fileCount: number;
  messageCount: number;
}

interface SharedCard extends WorkspaceCard {
  ownerName: string;
}

type Kind = "app" | "game" | "ai";

const CHOICES: { kind: Kind; title: string; icon: LucideIcon; desc: string; examples: string[] }[] = [
  {
    kind: "app",
    title: "Build an App",
    icon: AppWindow,
    desc: "Sites, tools & dashboards — describe it and Helix writes the code.",
    examples: ["a portfolio", "a to-do app", "a dashboard"],
  },
  {
    kind: "game",
    title: "Make a Game",
    icon: Gamepad2,
    desc: "2D & 3D games you build, play and share — pick a kind to start.",
    examples: ["a platformer", "a snake game", "an endless runner"],
  },
  {
    kind: "ai",
    title: "Build an AI Model",
    icon: Brain,
    desc: "Build and train real ML models on an interactive studio — pick a model to start.",
    examples: ["a decision tree", "a neural net", "a clustering model"],
  },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = { Footprints, Rabbit, Joystick, Map: MapIcon, Globe, Blocks, Sparkles };

/**
 * Editor home — a two-step "What do you want to make?" chooser. Step 1 is the
 * three big choices (App/Game/AI) with your existing projects below; picking one
 * opens that type's focused create step. A project's type is fixed, so there's no
 * switcher — to make a different thing you come back and choose again.
 */
export function StudioHome({
  workspaces,
  sharedWorkspaces,
  isGuest,
  isAdmin,
}: {
  workspaces: WorkspaceCard[];
  sharedWorkspaces?: SharedCard[];
  isGuest?: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"choose" | "create">("choose");
  const [kind, setKind] = useState<Kind>("app");
  const [picking, setPicking] = useState(false);
  const [pickingHost, setPickingHost] = useState(false);
  const [scratchName, setScratchName] = useState("");
  const [namePrompt, setNamePrompt] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { creating, error, setError, uploadNote, createScratch, createGame, importFolder, importRepo: importRepoBase } =
    useWorkspaceCreation();

  function choose(k: Kind) {
    setKind(k);
    setView("create");
    setShowOther(false);
    setError(null);
  }
  function backToChooser() {
    setView("choose");
    setNamePrompt(false);
    setError(null);
  }

  async function importRepo(provider: GitProviderName, repo: string) {
    if (!(await importRepoBase(provider, repo))) {
      setPicking(false);
      setPickingHost(false);
    }
  }

  const gameCats = GAME_CATEGORIES.filter((c) => !c.adminOnly || isAdmin);

  function ProjectCard(w: WorkspaceCard) {
    return (
      <li key={w.id} className="glass-panel group relative p-4 transition-colors hover:border-accent">
        <WorkspaceCardMenu id={w.id} name={w.name} />
        <button type="button" onClick={() => router.push(`/editor/${w.id}`)} className="w-full text-left">
          <div className="mb-2 flex items-center gap-2 pr-16">
            {w.kind === "game" ? (
              <Gamepad2 className="h-4 w-4 shrink-0 text-accent" />
            ) : w.mode === "IMPORT" ? (
              <FolderGit2 className="h-4 w-4 shrink-0 text-accent" />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0 text-ok" />
            )}
            <span className="truncate text-sm font-medium text-txt">{w.name}</span>
            <span className="ml-auto shrink-0 rounded-full border border-border2 bg-panel2 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-txt3">
              {w.kind === "game" ? "Game" : "App"}
            </span>
          </div>
          {w.repo && (
            <p className="mb-2 flex items-center gap-1 truncate font-mono text-[11px] text-txt3">
              <Lock className="h-3 w-3 shrink-0 opacity-60" />
              <span className="truncate">{w.repo}</span>
              {w.provider !== "github" && (
                <span className="shrink-0 text-[9px] uppercase tracking-wide text-txt3 opacity-70">
                  {PROVIDER_META[w.provider as GitProviderName]?.label ?? w.provider}
                </span>
              )}
            </p>
          )}
          <div className="flex items-center gap-3 font-mono text-[10px] text-txt3">
            <span className="inline-flex items-center gap-1">
              <FileCode2 className="h-3 w-3" /> {w.fileCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {w.messageCount}
            </span>
            <span className="ml-auto">{timeAgo(w.updatedAt)}</span>
          </div>
        </button>
      </li>
    );
  }

  /* ------------------------------- create step ------------------------------- */
  if (view === "create") {
    return (
      <div className="space-y-6">
        <button onClick={backToChooser} className="inline-flex items-center gap-1.5 text-[13px] text-txt3 transition-colors hover:text-txt">
          <ArrowLeft className="h-4 w-4" /> What do you want to make?
        </button>

        {kind === "app" && (
          <section>
            <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-txt">Build an App</h1>
            <p className="mb-6 text-sm text-txt3">Start from scratch, an existing repo, or a folder on your computer.</p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div
                className={cn("glass-panel-strong p-6 text-left transition-colors", !namePrompt && "cursor-pointer hover:border-accent")}
                onClick={() => !namePrompt && setNamePrompt(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && !namePrompt && setNamePrompt(true)}
              >
                <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--green)_35%,transparent)] bg-[color-mix(in_srgb,var(--green)_12%,transparent)]">
                  <FilePlus2 className="h-5 w-5 text-ok" />
                </span>
                <h2 className="mb-1 text-base font-medium text-txt">Create from scratch</h2>
                <p className="text-xs leading-relaxed text-txt3">Start empty. Describe what you want; files appear as Helix writes them.</p>
                {namePrompt && (
                  <form
                    className="mt-4 flex gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void createScratch(scratchName);
                    }}
                  >
                    <input
                      autoFocus
                      value={scratchName}
                      onChange={(e) => setScratchName(e.target.value)}
                      placeholder="Project name (optional)"
                      className="flex-1 rounded-lg border border-border bg-bg2 px-3 py-2 text-xs text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
                    />
                    <Button type="submit" disabled={creating}>
                      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
                    </Button>
                  </form>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setPicking(true);
                  setError(null);
                }}
                className="glass-panel-strong p-6 text-left transition-colors hover:border-accent"
              >
                <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl">
                  <FolderGit2 className="h-5 w-5 text-accent" />
                </span>
                <h2 className="mb-1 text-base font-medium text-txt">Import from GitHub</h2>
                <p className="text-xs leading-relaxed text-txt3">Pick a repo — private included. Edit it with Helix, then push the changes back.</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPickingHost(true);
                  setError(null);
                }}
                className="glass-panel-strong p-6 text-left transition-colors hover:border-accent"
              >
                <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-border2 bg-panel2">
                  <GitBranch className="h-5 w-5 text-txt2" />
                </span>
                <h2 className="mb-1 text-base font-medium text-txt">Import from another Git host</h2>
                <p className="text-xs leading-relaxed text-txt3">GitLab, Bitbucket, Azure DevOps, Gitea/Codeberg — connect with a token.</p>
              </button>

              <button
                type="button"
                disabled={creating}
                onClick={() => {
                  setError(null);
                  folderInputRef.current?.click();
                }}
                className="glass-panel-strong p-6 text-left transition-colors hover:border-accent disabled:opacity-60"
              >
                <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_12%,transparent)]">
                  {uploadNote && creating ? <Loader2 className="h-5 w-5 animate-spin text-warn" /> : <UploadCloud className="h-5 w-5 text-warn" />}
                </span>
                <h2 className="mb-1 text-base font-medium text-txt">Import from folder</h2>
                <p className="text-xs leading-relaxed text-txt3">{uploadNote ?? "Upload a project from your computer. Run it live, then push it to GitHub."}</p>
              </button>
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                aria-label="Choose a project folder to import"
                // @ts-expect-error — webkitdirectory is a non-standard but universally supported attribute
                webkitdirectory=""
                multiple
                onChange={(e) => {
                  if (e.target.files?.length) void importFolder(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </section>
        )}

        {kind === "game" && (
          <section>
            <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-txt">Make a Game</h1>
            <p className="mb-6 text-sm text-txt3">Pick a kind of game — Helix sets up the starter and you describe the rest in chat.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {gameCats.map((c) => {
                const Icon = CATEGORY_ICONS[c.icon] ?? Sparkles;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={creating}
                    onClick={() => void createGame(c.id)}
                    className="glass-panel-strong flex items-start gap-3 p-5 text-left transition-colors hover:border-accent disabled:opacity-60"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl">
                      <Icon className="h-5 w-5 text-accent" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-txt">{c.label}</span>
                      <span className="block text-xs leading-relaxed text-txt3">{c.example}</span>
                    </span>
                    {creating ? (
                      <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin text-txt3" />
                    ) : (
                      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-txt3" strokeWidth={1.8} />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {kind === "ai" && (
          <section>
            <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-txt">Build an AI Model</h1>
            <p className="mb-6 text-sm text-txt3">Pick a model to build and train on an interactive studio — no code, with an AI guide alongside you.</p>
            <Link
              href="/editor/ai"
              className="flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[linear-gradient(110deg,color-mix(in_srgb,var(--accent)_14%,transparent),transparent)] px-5 py-5 transition-colors hover:border-accent"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-hl">
                <Brain className="h-5 w-5 text-accent" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-medium text-txt">Open the model studio</span>
                <span className="block text-xs leading-relaxed text-txt3">
                  Build a decision tree, neural net, regression or clustering model — grow it, train it, and an AI guide helps as you go.
                </span>
              </span>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-txt3" strokeWidth={1.8} />
            </Link>
          </section>
        )}

        {error && <p className="text-xs text-warn">{error}</p>}

        {picking && <RepoPicker busy={creating} isGuest={isGuest} onSelect={(repo) => void importRepo("github", repo)} onClose={() => setPicking(false)} />}
        {pickingHost && <GitHostPicker busy={creating} onSelect={(provider, repo) => void importRepo(provider, repo)} onClose={() => setPickingHost(false)} />}
      </div>
    );
  }

  /* -------------------------------- chooser -------------------------------- */
  const renderChoiceCard = (c: (typeof CHOICES)[number]) => {
    const Icon = c.icon;
    return (
      <button
        key={c.kind}
        type="button"
        onClick={() => choose(c.kind)}
        className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-panel p-6 text-center shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-accent"
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-hl transition-colors group-hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]">
          <Icon className="h-7 w-7 text-accent" strokeWidth={1.7} />
        </span>
        <span className="text-[17px] font-semibold text-txt">{c.title}</span>
        <span className="text-[12.5px] leading-relaxed text-txt2">{c.desc}</span>
        <span className="mt-1 flex flex-wrap justify-center gap-1.5">
          {c.examples.map((ex) => (
            <span key={ex} className="rounded-full border border-border2 bg-panel2 px-2 py-0.5 text-[10.5px] text-txt3">
              {ex}
            </span>
          ))}
        </span>
        <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
          Start <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-12">
      <section className="pt-4 text-center">
        <h1 className="text-[28px] font-bold tracking-tight text-txt sm:text-[32px]">What do you want to make?</h1>
        <p className="mx-auto mt-2 max-w-[460px] text-sm text-txt2">Pick one to begin. Each project is its own thing — start a new one anytime to make something different.</p>

        {/* The two primary creation modes; everything else lives behind "Other". */}
        <div className="mx-auto mt-8 grid max-w-[620px] gap-4 sm:grid-cols-2">
          {CHOICES.filter((c) => c.kind === "app" || c.kind === "game").map(renderChoiceCard)}
        </div>

        <button
          type="button"
          onClick={() => setShowOther(true)}
          className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border bg-panel px-4 py-2 text-[13px] font-medium text-txt2 transition-colors hover:border-accent hover:text-txt"
        >
          <Sparkles className="h-4 w-4 text-accent" /> Other ways to create
        </button>

        {error && <p className="mt-4 text-xs text-warn">{error}</p>}
      </section>

      {showOther && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setShowOther(false)}>
          <div
            className="w-full max-w-[460px] rounded-2xl border border-border2 bg-panel p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-txt">More ways to create</h2>
              <button type="button" onClick={() => setShowOther(false)} className="text-txt3 transition-colors hover:text-txt">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3">
              {CHOICES.filter((c) => c.kind === "ai").map(renderChoiceCard)}
              {/* Roadmap placeholder — design 3D inventions/models (not yet live). */}
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border2 bg-panel2 p-6 text-center opacity-70">
                <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border2 bg-hl">
                  <Blocks className="h-7 w-7 text-txt3" strokeWidth={1.7} />
                </span>
                <span className="text-[15px] font-semibold text-txt2">Build 3D Models</span>
                <span className="text-[12px] leading-relaxed text-txt3">Design inventions &amp; 3D objects — coming soon.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {workspaces.length > 0 && (
        <section>
          <h2 className="label-tactical mb-3">Your projects</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{workspaces.map(ProjectCard)}</ul>
        </section>
      )}

      {sharedWorkspaces && sharedWorkspaces.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="label-tactical">Shared with you</h2>
            <Users className="h-3.5 w-3.5 text-txt3" />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sharedWorkspaces.map((w) => (
              <li key={w.id} className="relative">
                <WorkspaceCardMenu id={w.id} name={w.name} canManage={false} />
                <button
                  type="button"
                  onClick={() => router.push(`/editor/${w.id}`)}
                  className="glass-panel block w-full p-4 text-left transition-colors hover:border-accent"
                >
                  <div className="mb-1 flex items-center gap-2 pr-8">
                    {w.kind === "game" ? (
                      <Gamepad2 className="h-4 w-4 shrink-0 text-accent" />
                    ) : w.mode === "IMPORT" ? (
                      <FolderGit2 className="h-4 w-4 shrink-0 text-accent" />
                    ) : (
                      <Sparkles className="h-4 w-4 shrink-0 text-ok" />
                    )}
                    <span className="truncate text-sm font-medium text-txt">{w.name}</span>
                  </div>
                  <p className="mb-2 truncate text-[11px] text-txt3">by {w.ownerName}</p>
                  <div className="flex items-center gap-3 font-mono text-[10px] text-txt3">
                    <span className="inline-flex items-center gap-1">
                      <FileCode2 className="h-3 w-3" /> {w.fileCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {w.messageCount}
                    </span>
                    <span className="ml-auto">{timeAgo(w.updatedAt)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {picking && <RepoPicker busy={creating} isGuest={isGuest} onSelect={(repo) => void importRepo("github", repo)} onClose={() => setPicking(false)} />}
      {pickingHost && <GitHostPicker busy={creating} onSelect={(provider, repo) => void importRepo(provider, repo)} onClose={() => setPickingHost(false)} />}
    </div>
  );
}
