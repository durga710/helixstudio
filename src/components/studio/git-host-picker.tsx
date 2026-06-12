"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, FolderGit2, GitBranch, Loader2, Lock, Search, X } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PROVIDER_META, isValidRepoId, type GitProviderName } from "@/lib/git/meta";

interface RepoEntry {
  repo: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string | null;
}

type HostName = Exclude<GitProviderName, "github">;

const HOSTS: { name: HostName; caption: string }[] = [
  { name: "gitlab", caption: "gitlab.com or self-hosted" },
  { name: "bitbucket", caption: "Bitbucket Cloud" },
  { name: "azure", caption: "dev.azure.com" },
  { name: "gitea", caption: "Codeberg & self-hosted" },
];

/** PATCH /api/preferences field names per provider. */
const HOST_FIELDS: Record<HostName, { token: string; baseUrl?: string; org?: string }> = {
  gitlab: { token: "gitlabToken", baseUrl: "gitlabBaseUrl" },
  bitbucket: { token: "bitbucketToken" },
  azure: { token: "azureToken", org: "azureOrg" },
  gitea: { token: "giteaToken", baseUrl: "giteaBaseUrl" },
};

interface GitConfig {
  gitlabBaseUrl?: string | null;
  azureOrg?: string | null;
  giteaBaseUrl?: string | null;
}

const fieldCls =
  "w-full rounded-lg border border-border bg-bg2 px-3 py-2 font-mono text-xs text-txt placeholder:text-txt3 focus:border-accent focus:outline-none";

/**
 * Modal picker for the non-GitHub git hosts (GitLab, Bitbucket, Azure DevOps,
 * Gitea/Forgejo). Three steps: choose a host → connect it with a token (if it
 * isn't yet) → pick one of your repos or type its id manually.
 */
export function GitHostPicker({
  busy,
  onSelect,
  onClose,
}: {
  busy: boolean;
  onSelect: (provider: GitProviderName, repo: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"grid" | "connect" | "list">("grid");
  const [provider, setProvider] = useState<HostName>("gitlab");
  const [connections, setConnections] = useState<Partial<Record<GitProviderName, boolean>> | null>(null);
  const [gitConfig, setGitConfig] = useState<GitConfig>({});

  // connect form
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [org, setOrg] = useState("");
  const [saving, setSaving] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // repo list
  const [repos, setRepos] = useState<RepoEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const meta = PROVIDER_META[provider];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        const d = json?.data ?? json;
        if (d?.gitConnections) setConnections(d.gitConnections);
        else setConnections({});
        if (d?.gitConfig) setGitConfig(d.gitConfig);
      } catch {
        if (!cancelled) setConnections({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function backToGrid() {
    setStep("grid");
    setConnectError(null);
    setListError(null);
    setRepos(null);
    setSelected(null);
  }

  function pickHost(name: HostName) {
    setProvider(name);
    setToken("");
    setConnectError(null);
    setBaseUrl((name === "gitlab" ? gitConfig.gitlabBaseUrl : name === "gitea" ? gitConfig.giteaBaseUrl : "") ?? "");
    setOrg((name === "azure" ? gitConfig.azureOrg : "") ?? "");
    if (connections?.[name]) void loadRepos(name);
    else setStep("connect");
  }

  async function loadRepos(name: HostName) {
    setStep("list");
    setRepos(null);
    setListError(null);
    setFilter("");
    setManual("");
    setManualError(null);
    try {
      const res = await fetch(`/api/git/repos?provider=${name}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setRepos(json.data.repos);
      } else if (json?.error?.code === "GITHUB_UNAUTHORIZED") {
        // Generic not-connected code for every host — back to the token form.
        setStep("connect");
        setConnectError("That token didn't work — check it and try again.");
      } else {
        setListError(json?.error?.message ?? "Couldn't list your repos.");
      }
    } catch {
      setListError("Couldn't list your repos.");
    }
  }

  async function connect() {
    if (saving) return;
    setSaving(true);
    setConnectError(null);
    try {
      const fields = HOST_FIELDS[provider];
      const body: Record<string, string> = { [fields.token]: token.trim() };
      if (fields.baseUrl) body[fields.baseUrl] = baseUrl.trim();
      if (fields.org) body[fields.org] = org.trim();
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setConnectError(json?.error?.message ?? "Couldn't save the token.");
      } else {
        setConnections((c) => ({ ...c, [provider]: true }));
        setToken("");
        await loadRepos(provider);
      }
    } catch {
      setConnectError("Network error. Try again.");
    }
    setSaving(false);
  }

  function importManual() {
    const repo = manual.trim();
    if (!isValidRepoId(provider, repo)) {
      setManualError(`That doesn't look right — expected something like ${meta.repoIdHint}.`);
      return;
    }
    setSelected(repo);
    onSelect(provider, repo);
  }

  const connectReady =
    token.trim().length > 0 &&
    (meta.needsBaseUrl !== "required" || baseUrl.trim().length > 0) &&
    (!meta.needsOrg || org.trim().length > 0);

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
          {step !== "grid" && (
            <button
              type="button"
              onClick={backToGrid}
              aria-label="Back to host list"
              className="text-txt3 transition-colors hover:text-txt"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <GitBranch className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-medium text-txt">
            {step === "grid"
              ? "Import from another Git host"
              : step === "connect"
                ? `Connect ${meta.label}`
                : `Import from ${meta.label}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-txt3 transition-colors hover:text-txt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "grid" && (
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            {HOSTS.map(({ name, caption }) => (
              <button
                key={name}
                type="button"
                onClick={() => pickHost(name)}
                className="rounded-lg border border-border bg-panel2 p-4 text-left transition-colors hover:border-accent"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-txt">
                  {PROVIDER_META[name].label}
                  {connections?.[name] && (
                    <span
                      title="connected"
                      aria-label="connected"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok"
                    />
                  )}
                </span>
                <span className="mt-1 block text-xs text-txt3">{caption}</span>
              </button>
            ))}
            {connections === null && (
              <p className="col-span-full flex items-center gap-2 px-1 text-[11px] text-txt3">
                <Loader2 className="h-3 w-3 animate-spin" /> checking connections…
              </p>
            )}
          </div>
        )}

        {step === "connect" && (
          <form
            className="space-y-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (connectReady) void connect();
            }}
          >
            <p className="text-xs leading-relaxed text-txt3">{meta.tokenHelp}</p>
            <div>
              <label className="label-tactical mb-1.5 block">Access token</label>
              <input
                autoFocus
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={meta.tokenPlaceholder}
                autoComplete="off"
                className={fieldCls}
              />
            </div>
            {meta.needsBaseUrl !== "no" && (
              <div>
                <label className="label-tactical mb-1.5 block">
                  Server URL{meta.needsBaseUrl === "optional" ? " (optional)" : ""}
                </label>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={meta.baseUrlPlaceholder}
                  className={fieldCls}
                />
              </div>
            )}
            {meta.needsOrg && (
              <div>
                <label className="label-tactical mb-1.5 block">Organization</label>
                <input
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  placeholder="your-organization"
                  className={fieldCls}
                />
                <p className="mt-1.5 text-[10px] text-txt3">
                  The {"{org}"} in dev.azure.com/{"{org}"}.
                </p>
              </div>
            )}
            {connectError && <p className="text-xs text-warn">{connectError}</p>}
            <Button type="submit" disabled={saving || !connectReady} className="w-full justify-center">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
              Connect & list repos
            </Button>
          </form>
        )}

        {step === "list" &&
          (listError ? (
            <p className="p-8 text-center text-xs text-warn">{listError}</p>
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
              <ul className="scroll-area min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
                {visible.length === 0 && (
                  <li className="px-3 py-6 text-center text-xs text-txt3">
                    {repos.length === 0 ? "No repos found." : "No repos match."}
                  </li>
                )}
                {visible.map((r) => (
                  <li key={r.repo}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSelected(r.repo);
                        onSelect(provider, r.repo);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                        "hover:bg-hl disabled:opacity-60",
                        selected === r.repo && "bg-hl",
                      )}
                    >
                      <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-txt3" />
                      <span className="truncate font-mono text-xs text-txt">{r.repo}</span>
                      {r.private && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-panel2 px-1.5 py-0.5 font-mono text-[9px] uppercase text-txt2">
                          <Lock className="h-2.5 w-2.5" /> private
                        </span>
                      )}
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-txt3">
                        {r.defaultBranch}
                        {r.pushedAt ? ` · ${timeAgo(r.pushedAt)}` : ""}
                      </span>
                      {busy && selected === r.repo && (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="border-t border-border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  importManual();
                }}
              >
                <div className="flex gap-2">
                  <input
                    value={manual}
                    onChange={(e) => {
                      setManual(e.target.value);
                      setManualError(null);
                    }}
                    placeholder={meta.repoIdHint}
                    aria-label="Repo id"
                    className={fieldCls}
                  />
                  <Button type="submit" disabled={busy || !manual.trim()}>
                    {busy && selected === manual.trim() ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Import"
                    )}
                  </Button>
                </div>
                {manualError ? (
                  <p className="mt-1.5 text-[11px] text-warn">{manualError}</p>
                ) : (
                  <p className="mt-1.5 text-[10px] text-txt3">
                    Not in the list? Type its id ({meta.repoIdHint}) and import directly.
                  </p>
                )}
              </form>
            </>
          ))}
      </div>
    </div>
  );
}
