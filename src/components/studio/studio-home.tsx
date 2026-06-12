"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RepoPicker } from "@/components/studio/repo-picker";
import { GitHostPicker } from "@/components/studio/git-host-picker";
import { useWorkspaceCreation } from "@/components/studio/use-workspace-creation";
import { PROVIDER_META, type GitProviderName } from "@/lib/git/meta";

interface WorkspaceCard {
  id: string;
  name: string;
  mode: "SCRATCH" | "IMPORT";
  repo: string | null;
  provider: string;
  updatedAt: string;
  fileCount: number;
  messageCount: number;
}

/**
 * Studio home — the entry choice. Two big doors: create from scratch, or
 * import from GitHub (which opens the repo picker, which handles the
 * "GitHub not connected" prompt). Existing workspaces listed below.
 */
export function StudioHome({
  workspaces,
  isGuest,
}: {
  workspaces: WorkspaceCard[];
  isGuest?: boolean;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [pickingHost, setPickingHost] = useState(false);
  const [scratchName, setScratchName] = useState("");
  const [namePrompt, setNamePrompt] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Shared creation flows (also used by the global "Start new project" modal).
  const { creating, error, setError, uploadNote, createScratch, importFolder, importRepo: importRepoBase } =
    useWorkspaceCreation();

  async function importRepo(provider: GitProviderName, repo: string) {
    if (!(await importRepoBase(provider, repo))) {
      // surface the error on the page behind the picker
      setPicking(false);
      setPickingHost(false);
    }
  }

  async function deleteWorkspace(id: string) {
    if (deleting) return;
    if (!window.confirm("Delete this workspace? Its files and chat are gone for good (GitHub repos are untouched).")) return;
    setDeleting(id);
    try {
      await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      router.refresh();
    } catch {
      // refresh shows the truth either way
    }
    setDeleting(null);
  }

  return (
    <div className="space-y-10">
      {/* Entry choice */}
      <section>
        <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-txt">Start building</h1>
        <p className="mb-6 text-sm text-txt3">
          Chat with Helix and watch the code land in a live workspace — then push it to GitHub.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Create from scratch */}
          <div
            className={cn(
              "glass-panel-strong p-6 text-left transition-colors",
              !namePrompt && "cursor-pointer hover:border-accent",
            )}
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

          {/* Import from GitHub */}
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
              Pick one of your repos — private included. Browse and edit it with Helix, then push the
              changes back as a branch or PR.
            </p>
          </button>

          {/* Import from another Git host */}
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

          {/* Import from folder */}
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
              {uploadNote && creating ? (
                <Loader2 className="h-5 w-5 animate-spin text-warn" />
              ) : (
                <UploadCloud className="h-5 w-5 text-warn" />
              )}
            </span>
            <h2 className="mb-1 text-base font-medium text-txt">Import from folder</h2>
            <p className="text-xs leading-relaxed text-txt3">
              {uploadNote ??
                "Upload a project from your computer — built with Claude Code or anything else. Run it live here, then push it to a new GitHub repo."}
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

        {error && <p className="mt-3 text-xs text-warn">{error}</p>}
      </section>

      {/* Existing workspaces */}
      {workspaces.length > 0 && (
        <section>
          <h2 className="label-tactical mb-3">Your workspaces</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((w) => (
              <li key={w.id} className="glass-panel group relative p-4 transition-colors hover:border-accent">
                <button
                  type="button"
                  onClick={() => router.push(`/editor/${w.id}`)}
                  className="w-full text-left"
                >
                  <div className="mb-2 flex items-center gap-2">
                    {w.mode === "IMPORT" ? (
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
            ))}
          </ul>
        </section>
      )}

      {picking && (
        <RepoPicker
          busy={creating}
          isGuest={isGuest}
          onSelect={(repo) => void importRepo("github", repo)}
          onClose={() => setPicking(false)}
        />
      )}

      {pickingHost && (
        <GitHostPicker
          busy={creating}
          onSelect={(provider, repo) => void importRepo(provider, repo)}
          onClose={() => setPickingHost(false)}
        />
      )}
    </div>
  );
}
