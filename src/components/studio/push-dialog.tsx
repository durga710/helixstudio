"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Loader2,
  Lock,
  UploadCloud,
  X,
} from "lucide-react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import type { WorkspaceMeta } from "@/components/studio/studio";
import { GitHubIcon } from "@/components/studio/github-icon";

interface PushResult {
  repo: string;
  repoUrl?: string;
  branch: string;
  commitUrl: string;
  prUrl?: string | null;
  prError?: string | null;
}

const fieldCls =
  "w-full rounded-lg border border-border bg-bg2 px-3 py-2 text-xs text-txt placeholder:text-txt3 focus:border-accent focus:outline-none";

/**
 * Push the workspace overlay to GitHub.
 *  - No repo yet (scratch, never pushed): create a new repo.
 *  - Has a repo (imported, or scratch after first push): push a branch with
 *    an optional PR, or commit straight to the base branch.
 */
export function PushDialog({
  workspace,
  dirtyCount,
  isGuest,
  onClose,
}: {
  workspace: WorkspaceMeta;
  dirtyCount: number;
  isGuest?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const hasRepo = Boolean(workspace.repo);

  const [repoName, setRepoName] = useState(
    workspace.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "helix-app",
  );
  const [isPrivate, setIsPrivate] = useState(false);
  const [message, setMessage] = useState("");
  const [openPr, setOpenPr] = useState(true);
  const [prTitle, setPrTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsGithub, setNeedsGithub] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  async function push() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = hasRepo
        ? {
            target: "repo" as const,
            ...(message.trim() ? { message: message.trim() } : {}),
            ...(openPr
              ? { prTitle: prTitle.trim() || `Helix: ${workspace.name}` }
              : { branch: workspace.baseBranch ?? undefined }),
          }
        : {
            target: "new-repo" as const,
            name: repoName.trim(),
            private: isPrivate,
            ...(message.trim() ? { message: message.trim() } : {}),
          };

      const res = await fetch(`/api/workspaces/${workspace.id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (json?.error?.code === "GITHUB_UNAUTHORIZED") setNeedsGithub(true);
        else setError(json?.error?.message ?? "Push failed.");
      } else {
        setResult(json.data);
        router.refresh();
      }
    } catch {
      setError("Network error. Try again.");
    }
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="glass-panel-strong fade-up w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <UploadCloud className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-medium text-txt">Push to GitHub</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-txt3 transition-colors hover:text-txt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {result ? (
            <div className="space-y-3 text-sm">
              <p className="font-medium text-ok">Pushed ✓</p>
              <ul className="space-y-2 text-xs">
                <li className="flex items-center gap-2 text-txt2">
                  <GitHubIcon className="h-3.5 w-3.5 shrink-0 text-txt3" />
                  <span className="truncate font-mono">{result.repo}</span>
                  {result.repoUrl && (
                    <a href={result.repoUrl} target="_blank" rel="noreferrer" className="shrink-0 text-accent hover:brightness-110">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
                <li className="flex items-center gap-2 text-txt2">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-txt3" />
                  <span className="truncate font-mono">{result.branch}</span>
                  <a href={result.commitUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-accent hover:brightness-110">
                    commit <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                {result.prUrl && (
                  <li className="flex items-center gap-2 text-txt2">
                    <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-txt3" />
                    <a href={result.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-accent hover:brightness-110">
                      open the pull request <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </li>
                )}
                {result.prError && (
                  <li className="text-warn">Branch pushed, but the PR failed: {result.prError}</li>
                )}
              </ul>
              <Button variant="ghost" onClick={onClose} className="w-full justify-center">
                Done
              </Button>
            </div>
          ) : needsGithub ? (
            <div className="py-2 text-center">
              <GitHubIcon className="mx-auto mb-3 h-8 w-8 text-txt3" />
              <p className="mb-4 text-xs text-txt2">
                {isGuest
                  ? "Pushing needs a GitHub account — sign in and your workspaces come with you."
                  : "GitHub isn't connected — connect it to push this workspace."}
              </p>
              <Button
                onClick={() => {
                  if (isGuest) window.location.href = "/login";
                  else void signIn("github", { callbackUrl: window.location.href });
                }}
              >
                <GitHubIcon className="h-3.5 w-3.5" /> {isGuest ? "Sign in with GitHub" : "Connect GitHub"}
              </Button>
            </div>
          ) : (
            <>
              {dirtyCount > 0 && (
                <p className="text-[11px] text-warn">
                  You have {dirtyCount} unsaved edit(s) — save first or they won&apos;t be in the push.
                </p>
              )}

              {hasRepo ? (
                <>
                  <p className="text-xs text-txt2">
                    Pushing your changes to <span className="font-mono text-txt">{workspace.repo}</span>.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-txt2">
                    <input
                      type="checkbox"
                      checked={openPr}
                      onChange={(e) => setOpenPr(e.target.checked)}
                      className="accent-accent"
                    />
                    Open a pull request (new branch)
                  </label>
                  {openPr ? (
                    <div>
                      <label className="label-tactical mb-1.5 block">
                        PR title
                      </label>
                      <input
                        value={prTitle}
                        onChange={(e) => setPrTitle(e.target.value)}
                        placeholder={`Helix: ${workspace.name}`}
                        className={fieldCls}
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-txt3">
                      Commits straight to <span className="font-mono">{workspace.baseBranch ?? "the default branch"}</span>.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="label-tactical mb-1.5 block">
                      New repo name
                    </label>
                    <input
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value)}
                      placeholder="my-app"
                      className={`${fieldCls} font-mono`}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-txt2">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="accent-accent"
                    />
                    <Lock className="h-3 w-3 text-txt3" /> Private repo
                  </label>
                </>
              )}

              <div>
                <label className="label-tactical mb-1.5 block">
                  Commit message
                </label>
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={hasRepo ? `Helix: update ${workspace.name}` : `Helix: ${workspace.name}`}
                  className={fieldCls}
                />
              </div>

              {error && <p className="text-xs text-warn">{error}</p>}

              <Button
                onClick={() => void push()}
                disabled={busy || (!hasRepo && !repoName.trim())}
                className="w-full justify-center"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                {hasRepo ? (openPr ? "Push & open PR" : "Push") : "Create repo & push"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
