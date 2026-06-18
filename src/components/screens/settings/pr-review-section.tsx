"use client";

import { useEffect, useState } from "react";
import { Loader2, GitPullRequest } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

interface Repo {
  repo: string;
  private: boolean;
}

/**
 * Auto-review pull requests: toggle a connected GitHub repo and Helix installs
 * a webhook that reviews each PR with inline comments (the same reviewer the
 * Diff tab uses). Only shows when GitHub is connected.
 */
export function PrReviewSection() {
  const { toast } = useToast();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/git/repos?provider=github").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch("/api/git/watch").then((r) => (r.ok ? r.json() : { data: { watches: [] } })),
    ])
      .then(([reposJson, watchJson]) => {
        setRepos((reposJson.data?.repos ?? []).slice(0, 100));
        setWatched(new Set((watchJson.data?.watches ?? []).map((w: { repo: string }) => w.repo)));
      })
      .catch(() => setUnavailable(true));
  }, []);

  async function toggle(repo: string, on: boolean) {
    setBusy(repo);
    const res = await fetch("/api/git/watch", {
      method: on ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) {
      setWatched((s) => {
        const next = new Set(s);
        if (on) next.add(repo);
        else next.delete(repo);
        return next;
      });
      toast(on ? `Auto-review on for ${repo}` : `Auto-review off for ${repo}`);
    } else {
      toast(json?.error?.message ?? "Couldn't update the webhook.");
    }
    setBusy(null);
  }

  const visible = (repos ?? []).filter((r) => r.repo.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <>
      <h3 className="mb-[11px] mt-6 text-sm font-semibold">Auto-review pull requests</h3>
      <Card className="p-[18px]">
        <p className="mb-3 flex items-center gap-2 text-xs text-txt2">
          <GitPullRequest className="h-3.5 w-3.5 text-accent" />
          Turn this on for a GitHub repo and Helix reviews every new pull request — posting inline
          comments and a ship/hold verdict, using your editor AI model. (GitHub only for now.)
        </p>
        {unavailable ? (
          <p className="py-3 text-xs text-txt3">
            Connect your GitHub account (Settings → Git hosts) to choose repos for auto-review.
          </p>
        ) : repos === null ? (
          <div className="flex items-center gap-2 py-4 text-xs text-txt3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading your repos…
          </div>
        ) : repos.length === 0 ? (
          <p className="py-3 text-xs text-txt3">No repos found for your GitHub account.</p>
        ) : (
          <>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter repos…"
              aria-label="Filter repositories"
              className="mb-2 w-full rounded-lg border border-border2 bg-panel2 px-3 py-1.5 text-xs text-txt outline-none focus:border-accent"
            />
            <div className="scroll-area max-h-64 divide-y divide-border overflow-y-auto">
              {visible.map((r) => (
                <div key={r.repo} className="flex items-center gap-2 py-2">
                  <span className="truncate font-mono text-[11.5px] text-txt2">{r.repo}</span>
                  {r.private && <Pill tone="neutral">private</Pill>}
                  {watched.has(r.repo) && <Pill tone="green">on</Pill>}
                  <div className="ml-auto flex items-center gap-2">
                    {busy === r.repo && <Loader2 className="h-3.5 w-3.5 animate-spin text-txt3" />}
                    <Switch
                      checked={watched.has(r.repo)}
                      onCheckedChange={(on) => void toggle(r.repo, on)}
                      aria-label={`Auto-review ${r.repo}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
