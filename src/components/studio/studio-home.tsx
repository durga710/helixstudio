"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Sparkles,
  FolderGit2,
  FilePlus2,
  GitBranch,
  Loader2,
  MessageSquare,
  FileCode2,
  Trash2,
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RepoPicker } from "@/components/studio/repo-picker";
import { GitHostPicker } from "@/components/studio/git-host-picker";
import { useWorkspaceCreation } from "@/components/studio/use-workspace-creation";
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

type EditorMode = "app" | "game" | "ai";

const MODES: { id: EditorMode; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: "app", label: "App", icon: AppWindow, blurb: "Sites, tools & dashboards" },
  { id: "game", label: "Game", icon: Gamepad2, blurb: "Build, play & share" },
  { id: "ai", label: "AI", icon: Brain, blurb: "Learn & train AI models" },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Footprints,
  Rabbit,
  Joystick,
  Map: MapIcon,
  Globe,
  Blocks,
  Sparkles,
};

/**
 * Editor home — mode-first. The user picks App / Game / AI before entering the
 * editor; each mode shows its own start options + its own projects. App/Game are
 * workspace-backed; AI opens the workspace-less lab/studios space.
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
  // Restore the last-used mode (lazy initializer — guarded for SSR) so returning
  // to the editor feels continuous.
  const [mode, setMode] = useState<EditorMode>(() => {
    if (typeof window === "undefined") return "app";
    const saved = window.localStorage.getItem("helix.editor.mode");
    return saved === "game" || saved === "ai" || saved === "app" ? saved : "app";
  });
  const [picking, setPicking] = useState(false);
  const [pickingHost, setPickingHost] = useState(false);
  const [scratchName, setScratchName] = useState("");
  const [namePrompt, setNamePrompt] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  function pickMode(m: EditorMode) {
    setMode(m);
    try {
      localStorage.setItem("helix.editor.mode", m);
    } catch {
      /* private mode — fine */
    }
  }

  const { creating, error, setError, uploadNote, createScratch, createGame, importFolder, importRepo: importRepoBase } =
    useWorkspaceCreation();

  async function importRepo(provider: GitProviderName, repo: string) {
    if (!(await importRepoBase(provider, repo))) {
      setPicking(false);
      setPickingHost(false);
    }
  }

  async function deleteWorkspace(id: string) {
    if (deleting) return;
    if (!window.confirm("Delete this workspace? Its files and chat are gone for good (GitHub repos are untouched).")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else setError("Couldn't delete that workspace — try again.");
    } catch {
      setError("Network error — couldn't delete the workspace.");
    }
    setDeleting(null);
  }

  const apps = workspaces.filter((w) => w.kind !== "game");
  const games = workspaces.filter((w) => w.kind === "game");
  const sharedApps = (sharedWorkspaces ?? []).filter((w) => w.kind !== "game");
  const sharedGames = (sharedWorkspaces ?? []).filter((w) => w.kind === "game");
  const gameCats = GAME_CATEGORIES.filter((c) => !c.adminOnly || isAdmin);

  function ProjectCard(w: WorkspaceCard) {
    return (
      <li key={w.id} className="glass-panel group relative p-4 transition-colors hover:border-accent">
        <button type="button" onClick={() => router.push(`/editor/${w.id}`)} className="w-full text-left">
          <div className="mb-2 flex items-center gap-2">
            {w.kind === "game" ? (
              <Gamepad2 className="h-4 w-4 shrink-0 text-accent" />
            ) : w.mode === "IMPORT" ? (
              <FolderGit2 className="h-4 w-4 shrink-0 text-accent" />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0 text-ok" />
            )}
            <span className="truncate text-sm font-medium text-txt">{w.name}</span>
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
        <button
          type="button"
          aria-label="Delete workspace"
          onClick={() => void deleteWorkspace(w.id)}
          className="absolute right-3 top-3 text-txt3 opacity-0 transition-all hover:text-bad group-hover:opacity-100"
        >
          {deleting === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-txt">What do you want to work on?</h1>
        <p className="mb-5 text-sm text-txt3">Pick a mode — the editor sets itself up for it.</p>

        {/* Mode switcher — the prompt before entering the editor. */}
        <div className="mb-7 grid gap-2.5 sm:grid-cols-3" role="group" aria-label="Editor mode">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMode(m.id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                  active
                    ? "border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                    : "border-border bg-panel hover:border-accent",
                )}
              >
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                    active ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-hl" : "border-border2 bg-panel2",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-accent" : "text-txt2")} strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-txt">{m.label}</span>
                  <span className="block text-[11.5px] text-txt3">{m.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* APP mode — scratch / import / folder doors */}
        {mode === "app" && (
          <>
            <Link
              href="/build"
              className="mb-4 flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[linear-gradient(110deg,color-mix(in_srgb,var(--accent)_14%,transparent),color-mix(in_srgb,#c084fc_10%,transparent))] px-5 py-4 transition-colors hover:border-accent"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--brand-cyan,#00ffd1)] via-accent to-[#c084fc]">
                <Sparkles className="h-5 w-5 text-white" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-medium text-txt">Build with AI</span>
                <span className="block text-xs leading-relaxed text-txt3">
                  Describe the app you want — Helix builds it while a live preview takes shape next to the chat.
                </span>
              </span>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-txt3" strokeWidth={1.8} />
            </Link>

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
                <p className="text-xs leading-relaxed text-txt3">
                  Start empty. Describe what you want; files appear in the workspace as Helix writes them.
                </p>
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
                <p className="text-xs leading-relaxed text-txt3">
                  Pick one of your repos — private included. Browse and edit it with Helix, then push the changes back.
                </p>
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
                <p className="text-xs leading-relaxed text-txt3">
                  GitLab, Bitbucket, Azure DevOps, Gitea/Codeberg — connect with a token and import.
                </p>
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
                <p className="text-xs leading-relaxed text-txt3">
                  {uploadNote ?? "Upload a project from your computer. Run it live here, then push it to a new GitHub repo."}
                </p>
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
          </>
        )}

        {/* GAME mode — pick a kind of game, we seed the starter */}
        {mode === "game" && (
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
        )}

        {/* AI mode — the workspace-less lab/studios space (Phase 2 swaps this to
            the embedded /editor/ai workspace). */}
        {mode === "ai" && (
          <Link
            href="/lab"
            className="flex items-center gap-3.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[linear-gradient(110deg,color-mix(in_srgb,var(--accent)_14%,transparent),transparent)] px-5 py-5 transition-colors hover:border-accent"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-hl">
              <Brain className="h-5 w-5 text-accent" strokeWidth={1.8} />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-medium text-txt">Enter the AI workspace</span>
              <span className="block text-xs leading-relaxed text-txt3">
                Learn ML by building it — open a Studio (decision trees, neural nets & more) with an AI guide that
                teaches you as you go.
              </span>
            </span>
            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-txt3" strokeWidth={1.8} />
          </Link>
        )}

        {error && <p className="mt-3 text-xs text-warn">{error}</p>}
      </section>

      {/* Projects for the current mode */}
      {mode === "app" && apps.length > 0 && (
        <section>
          <h2 className="label-tactical mb-3">Your apps</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{apps.map(ProjectCard)}</ul>
        </section>
      )}
      {mode === "game" && games.length > 0 && (
        <section>
          <h2 className="label-tactical mb-3">Your games</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{games.map(ProjectCard)}</ul>
        </section>
      )}

      {/* Shared with you (matches the active mode) */}
      {((mode === "app" && sharedApps.length > 0) || (mode === "game" && sharedGames.length > 0)) && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="label-tactical">Shared with you</h2>
            <Users className="h-3.5 w-3.5 text-txt3" />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(mode === "game" ? sharedGames : sharedApps).map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/editor/${w.id}`)}
                  className="glass-panel block w-full p-4 text-left transition-colors hover:border-accent"
                >
                  <div className="mb-1 flex items-center gap-2">
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

      {picking && (
        <RepoPicker busy={creating} isGuest={isGuest} onSelect={(repo) => void importRepo("github", repo)} onClose={() => setPicking(false)} />
      )}
      {pickingHost && (
        <GitHostPicker busy={creating} onSelect={(provider, repo) => void importRepo(provider, repo)} onClose={() => setPickingHost(false)} />
      )}
    </div>
  );
}
