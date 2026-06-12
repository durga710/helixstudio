"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  FolderGit2,
  FilePlus2,
  Loader2,
  MessageSquare,
  FileCode2,
  Trash2,
  Lock,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RepoPicker } from "@/components/studio/repo-picker";

interface WorkspaceCard {
  id: string;
  name: string;
  mode: "SCRATCH" | "IMPORT";
  repo: string | null;
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
  const [creating, setCreating] = useState(false);
  const [scratchName, setScratchName] = useState("");
  const [namePrompt, setNamePrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function createScratch() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "SCRATCH", ...(scratchName.trim() ? { name: scratchName.trim() } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? "Couldn't create the workspace.");
      } else {
        router.push(`/editor/${json.data.id}`);
        return;
      }
    } catch {
      setError("Network error. Try again.");
    }
    setCreating(false);
  }

  async function importRepo(repo: string) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "IMPORT", repo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? "Couldn't import the repo.");
        setPicking(false);
      } else {
        router.push(`/editor/${json.data.id}`);
        return;
      }
    } catch {
      setError("Network error. Try again.");
      setPicking(false);
    }
    setCreating(false);
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

        <div className="grid gap-4 sm:grid-cols-2">
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
                  void createScratch();
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
                      {w.repo}
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
          onSelect={(repo) => void importRepo(repo)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
