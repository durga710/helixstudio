"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { FolderGit2, Loader2, Lock, Search, X } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GitHubIcon } from "@/components/studio/github-icon";

interface RepoEntry {
  repo: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string | null;
}

/**
 * Modal repo picker for GitHub import. If GitHub isn't connected (or the
 * token was revoked) the API answers GITHUB_UNAUTHORIZED and this renders
 * the "Connect GitHub" prompt instead of a list.
 */
export function RepoPicker({
  busy,
  isGuest,
  onSelect,
  onClose,
}: {
  busy: boolean;
  isGuest?: boolean;
  onSelect: (repo: string) => void;
  onClose: () => void;
}) {
  const [repos, setRepos] = useState<RepoEntry[] | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/github/repos", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.ok) {
          setRepos(json.data.repos);
        } else if (json?.error?.code === "GITHUB_UNAUTHORIZED") {
          setUnauthorized(true);
        } else {
          setError(json?.error?.message ?? "Couldn't list your repos.");
        }
      } catch {
        if (!cancelled) setError("Couldn't list your repos.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = (repos ?? []).filter((r) =>
    r.repo.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="glass-panel-strong fade-up flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <FolderGit2 className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-medium text-txt">Import from GitHub</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-txt3 transition-colors hover:text-txt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {unauthorized ? (
          <div className="p-8 text-center">
            <GitHubIcon className="mx-auto mb-4 h-10 w-10 text-txt3" />
            <h3 className="mb-1.5 text-sm font-medium text-txt">GitHub isn&apos;t connected</h3>
            <p className="mx-auto mb-5 max-w-sm text-xs leading-relaxed text-txt3">
              Helix needs access to your GitHub account to list your repos (including private
              ones) and push code as you.
            </p>
            <Button
              onClick={() => {
                // Guests go through /login so their workspaces transfer to
                // the real account; signed-in users just (re)link GitHub.
                if (isGuest) window.location.href = "/login";
                else void signIn("github", { callbackUrl: window.location.href });
              }}
            >
              <GitHubIcon className="h-3.5 w-3.5" /> {isGuest ? "Sign in with GitHub" : "Connect GitHub"}
            </Button>
            <p className="mt-4 text-[11px] text-txt3">
              {isGuest ? (
                "Signing in keeps your guest workspaces."
              ) : (
                <>
                  Prefer a fine-grained token? Paste one in{" "}
                  <a href="/settings" className="text-accent underline underline-offset-2 hover:brightness-110">
                    Settings
                  </a>{" "}
                  instead.
                </>
              )}
            </p>
          </div>
        ) : error ? (
          <p className="p-8 text-center text-xs text-warn">{error}</p>
        ) : repos === null ? (
          <div className="grid place-items-center p-10 text-sm text-txt3">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> loading your repos…
            </span>
          </div>
        ) : (
          <>
            <div className="px-4 pb-2 pt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-txt3" />
                <input
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter repos…"
                  className="w-full rounded-lg border border-border bg-bg2 py-2 pl-9 pr-3 font-mono text-xs text-txt placeholder:text-txt3 focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <ul className="scroll-area flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
              {visible.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-txt3">No repos match.</li>
              )}
              {visible.map((r) => (
                <li key={r.repo}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelected(r.repo);
                      onSelect(r.repo);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                      "hover:bg-hl disabled:opacity-60",
                      selected === r.repo && "bg-hl",
                    )}
                  >
                    <span className="truncate font-mono text-xs text-txt">{r.repo}</span>
                    {r.private && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-panel2 px-1.5 py-0.5 font-mono text-[9px] uppercase text-txt2">
                        <Lock className="h-2.5 w-2.5" /> private
                      </span>
                    )}
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-txt3">
                      {r.pushedAt ? timeAgo(r.pushedAt) : ""}
                    </span>
                    {busy && selected === r.repo && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
