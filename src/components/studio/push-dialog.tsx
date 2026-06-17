"use client";

import { useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WorkspaceMeta } from "@/components/studio/studio";
import { GitHubIcon } from "@/components/studio/github-icon";
import { PROVIDER_META, type GitProviderName } from "@/lib/git/meta";

interface PushResult {
  repo: string;
  repoUrl?: string;
  branch: string;
  commitUrl: string;
  prUrl?: string | null;
  prError?: string | null;
}

interface SecretFinding {
  path: string;
  line: number;
  rule: string;
  preview: string;
}

const fieldCls =
  "w-full rounded-lg border border-border bg-bg2 px-3 py-2 text-xs text-txt placeholder:text-txt3 focus:border-accent focus:outline-none";

/** Token-based hosts that can be connected inline (GitHub uses OAuth instead).
 * Maps each to its PATCH /api/preferences field names (same as GitHostPicker). */
type TokenHost = Exclude<GitProviderName, "github">;
const HOST_FIELDS: Record<TokenHost, { token: string; baseUrl?: string; org?: string }> = {
  gitlab: { token: "gitlabToken", baseUrl: "gitlabBaseUrl" },
  bitbucket: { token: "bitbucketToken" },
  azure: { token: "azureToken", org: "azureOrg" },
  gitea: { token: "giteaToken", baseUrl: "giteaBaseUrl" },
};
const CONNECT_HOSTS: GitProviderName[] = ["github", "gitlab", "bitbucket", "azure", "gitea"];

/**
 * Push the workspace overlay to its git host (GitHub, GitLab, Bitbucket,
 * Azure DevOps, or Gitea — copy adapts to the workspace's provider).
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
  // For a new repo (scratch) the user can choose which connected host to create
  // it on; an existing repo is pinned to its host.
  const [provider, setProvider] = useState<GitProviderName>(
    PROVIDER_META[workspace.provider as GitProviderName] ? (workspace.provider as GitProviderName) : "github",
  );
  const meta = PROVIDER_META[provider] ?? PROVIDER_META.github;
  const isGithub = provider === "github";
  const [connections, setConnections] = useState<Partial<Record<GitProviderName, boolean>>>({});
  useEffect(() => {
    if (hasRepo) return;
    fetch("/api/preferences", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setConnections(((j?.data ?? j)?.gitConnections as Record<GitProviderName, boolean>) ?? {}))
      .catch(() => {});
  }, [hasRepo]);
  // GitHub is always offered (OAuth connect flow handles it); other hosts appear
  // once the user has a token saved for them.
  const hostOptions: GitProviderName[] = [
    "github",
    ...(["gitlab", "bitbucket", "azure", "gitea"] as GitProviderName[]).filter((h) => connections[h]),
  ];

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
  const [secrets, setSecrets] = useState<SecretFinding[] | null>(null);

  // Inline "connect another host" panel — so a new project can add a git host
  // without leaving the dialog for Settings.
  const [connectHost, setConnectHost] = useState<GitProviderName | null>(null);
  const [token, setToken] = useState("");
  const [connBaseUrl, setConnBaseUrl] = useState("");
  const [connOrg, setConnOrg] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState<string | null>(null);
  const connMeta = connectHost ? PROVIDER_META[connectHost] : null;
  const connectReady =
    token.trim().length > 0 &&
    (!connMeta || connMeta.needsBaseUrl !== "required" || connBaseUrl.trim().length > 0) &&
    (!connMeta?.needsOrg || connOrg.trim().length > 0);

  async function connectTokenHost() {
    if (connecting || !connectHost || connectHost === "github") return;
    const fields = HOST_FIELDS[connectHost as TokenHost];
    setConnecting(true);
    setConnectErr(null);
    try {
      const body: Record<string, string> = { [fields.token]: token.trim() };
      if (fields.baseUrl) body[fields.baseUrl] = connBaseUrl.trim();
      if (fields.org) body[fields.org] = connOrg.trim();
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setConnectErr(json?.error?.message ?? "Couldn't save the token.");
      } else {
        // Connected — make it available and selected, then close the panel.
        setConnections((c) => ({ ...c, [connectHost]: true }));
        setProvider(connectHost);
        setConnectHost(null);
        setToken("");
        setConnBaseUrl("");
        setConnOrg("");
      }
    } catch {
      setConnectErr("Network error. Try again.");
    }
    setConnecting(false);
  }

  async function push(force = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (!force) setSecrets(null);
    try {
      const body = hasRepo
        ? {
            target: "repo" as const,
            ...(message.trim() ? { message: message.trim() } : {}),
            ...(openPr
              ? { prTitle: prTitle.trim() || `Helix: ${workspace.name}` }
              : { branch: workspace.baseBranch ?? undefined }),
            ...(force ? { allowSecrets: true } : {}),
          }
        : {
            target: "new-repo" as const,
            provider,
            name: repoName.trim(),
            private: isPrivate,
            ...(message.trim() ? { message: message.trim() } : {}),
            ...(force ? { allowSecrets: true } : {}),
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
      } else if (json.data?.secretsBlocked) {
        // Possible credentials found — show them and require an explicit override.
        setSecrets(json.data.secrets as SecretFinding[]);
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
          <h2 className="text-sm font-medium text-txt">Push to {meta.label}</h2>
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
                  {isGithub ? (
                    <GitHubIcon className="h-3.5 w-3.5 shrink-0 text-txt3" />
                  ) : (
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-txt3" />
                  )}
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
                      open the {meta.prNoun} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </li>
                )}
                {result.prError && (
                  <li className="text-warn">Branch pushed, but the {meta.prNoun} failed: {result.prError}</li>
                )}
              </ul>
              <Button variant="ghost" onClick={onClose} className="w-full justify-center">
                Done
              </Button>
            </div>
          ) : secrets ? (
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-warn">
                <Lock className="h-3.5 w-3.5" /> Possible secrets found
              </p>
              <p className="text-xs text-txt2">
                These look like hardcoded credentials. Pushing them to a repo can leak them. Remove them (use an
                environment variable instead) — or push anyway if they&apos;re false positives.
              </p>
              <ul className="scroll-area max-h-44 space-y-1.5 overflow-auto rounded-lg border border-border bg-bg2 p-2.5">
                {secrets.map((s, i) => (
                  <li key={i} className="font-mono text-[11px] text-txt2">
                    <span className="text-bad">{s.rule}</span> · {s.path}:{s.line}{" "}
                    <span className="text-txt3">{s.preview}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSecrets(null)} className="flex-1 justify-center">
                  Go back
                </Button>
                <Button onClick={() => void push(true)} disabled={busy} className="flex-1 justify-center">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Push anyway
                </Button>
              </div>
            </div>
          ) : needsGithub ? (
            isGithub ? (
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
              <div className="py-2 text-center">
                <GitBranch className="mx-auto mb-3 h-8 w-8 text-txt3" />
                <p className="mb-4 text-xs text-txt2">
                  {meta.label} isn&apos;t connected — connect it in Settings → Git connections (paste a
                  token), then push again.
                </p>
                <Button onClick={() => (window.location.href = "/settings")}>
                  Open Settings
                </Button>
              </div>
            )
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
                    Open a {meta.prNoun} (new branch)
                  </label>
                  {openPr ? (
                    <div>
                      <label className="label-tactical mb-1.5 block">
                        {meta.prNoun === "merge request" ? "MR" : "PR"} title
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
                    <label className="label-tactical mb-1.5 block">Where to create it</label>
                    <div className="flex flex-wrap gap-1.5">
                      {hostOptions.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setProvider(h)}
                          className={cn(
                            "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                            provider === h
                              ? "border-accent bg-hl text-txt"
                              : "border-border2 bg-panel text-txt2 hover:border-accent hover:text-txt",
                          )}
                        >
                          {PROVIDER_META[h].label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setConnectHost((h) => (h ? null : "gitlab"));
                          setToken("");
                          setConnBaseUrl("");
                          setConnOrg("");
                          setConnectErr(null);
                        }}
                        className={cn(
                          "rounded-lg border border-dashed px-2.5 py-1.5 text-xs transition-colors",
                          connectHost ? "border-accent text-txt" : "border-border2 text-txt3 hover:border-accent hover:text-txt",
                        )}
                      >
                        + connect another
                      </button>
                    </div>

                    {/* Inline connect — add a git host without leaving for Settings. */}
                    {connectHost && (
                      <div className="mt-2.5 space-y-2.5 rounded-lg border border-border2 bg-panel2 p-3">
                        <div className="flex flex-wrap gap-1.5">
                          {CONNECT_HOSTS.map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => {
                                setConnectHost(h);
                                setToken("");
                                setConnectErr(null);
                              }}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                                connectHost === h
                                  ? "border-accent bg-hl text-txt"
                                  : "border-border2 bg-panel text-txt2 hover:border-accent hover:text-txt",
                              )}
                            >
                              {PROVIDER_META[h].label}
                              {connections[h] && <span title="connected" className="h-1.5 w-1.5 rounded-full bg-ok" />}
                            </button>
                          ))}
                        </div>

                        {connectHost === "github" ? (
                          <Button
                            onClick={() => {
                              if (isGuest) window.location.href = "/login";
                              else void signIn("github", { callbackUrl: window.location.href });
                            }}
                            className="w-full justify-center"
                          >
                            <GitHubIcon className="h-3.5 w-3.5" /> {isGuest ? "Sign in with GitHub" : "Connect GitHub"}
                          </Button>
                        ) : (
                          <form
                            className="space-y-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (connectReady) void connectTokenHost();
                            }}
                          >
                            {connMeta?.tokenHelp && <p className="text-[11px] leading-relaxed text-txt3">{connMeta.tokenHelp}</p>}
                            <input
                              type="password"
                              autoComplete="off"
                              value={token}
                              onChange={(e) => setToken(e.target.value)}
                              placeholder={connMeta?.tokenPlaceholder ?? "access token"}
                              className={`${fieldCls} font-mono`}
                            />
                            {connMeta?.needsBaseUrl !== "no" && (
                              <input
                                value={connBaseUrl}
                                onChange={(e) => setConnBaseUrl(e.target.value)}
                                placeholder={connMeta?.baseUrlPlaceholder ?? "server URL"}
                                className={fieldCls}
                              />
                            )}
                            {connMeta?.needsOrg && (
                              <input
                                value={connOrg}
                                onChange={(e) => setConnOrg(e.target.value)}
                                placeholder="your-organization"
                                className={fieldCls}
                              />
                            )}
                            {connectErr && <p className="text-[11px] text-warn">{connectErr}</p>}
                            <Button type="submit" disabled={connecting || !connectReady} className="w-full justify-center">
                              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Connect {connMeta?.label}
                            </Button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
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
                {hasRepo
                  ? openPr
                    ? `Push & open ${meta.prNoun === "merge request" ? "MR" : "PR"}`
                    : "Push"
                  : "Create repo & push"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
