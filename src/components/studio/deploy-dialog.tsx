/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-open dialog, same pattern as the other studio dialogs */
"use client";

/**
 * Deploy a workspace to a hosting platform. Git-linked model: it links the
 * workspace's GitHub repo to a platform project (Vercel…), and the platform
 * auto-builds on every push thereafter. Shows the live site URL + status.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  ExternalLink,
  Loader2,
  MinusCircle,
  Rocket,
  RotateCw,
  XCircle,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";

interface DeployInfo {
  linked: boolean;
  provider?: string;
  projectName?: string;
  productionUrl?: string;
  dashboardUrl?: string;
  deploymentUrl?: string;
  state?: string;
}

type CheckStatus = "pass" | "warn" | "fail" | "skip";
interface PreflightCheck {
  id: "security" | "test" | "weight";
  label: string;
  status: CheckStatus;
  detail: string;
}
interface PreflightReport {
  checks: PreflightCheck[];
  ok: boolean;
}
interface DeployEvent {
  id: string;
  state: string;
  createdAt?: string;
  url?: string;
  target?: string;
}

function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <CheckCircle2 className="h-3.5 w-3.5 text-ok" />;
  if (status === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-warn" />;
  if (status === "fail") return <XCircle className="h-3.5 w-3.5 text-bad" />;
  return <MinusCircle className="h-3.5 w-3.5 text-txt3" />;
}

interface DeployPlatform {
  name: string;
  label: string;
  implemented: boolean;
  supportedGitHosts: string[];
  connected: boolean;
}

const STATE_PILL: Record<string, { label: string; tone: "green" | "amber" | "accent" | "red" | "neutral" }> = {
  READY: { label: "live", tone: "green" },
  BUILDING: { label: "building", tone: "accent" },
  QUEUED: { label: "queued", tone: "accent" },
  ERROR: { label: "build failed", tone: "red" },
  CANCELED: { label: "canceled", tone: "neutral" },
  UNKNOWN: { label: "—", tone: "neutral" },
};

export function DeployDialog({
  workspaceId,
  hasRepo,
  onClose,
}: {
  workspaceId: string;
  /** The workspace has been pushed to a GitHub repo (deploy precondition). */
  hasRepo: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [info, setInfo] = useState<DeployInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [platforms, setPlatforms] = useState<DeployPlatform[]>([]);
  const [provider, setProvider] = useState("vercel");
  // Real pre-deploy gate (security scan + tests + bundle weight).
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  // Monitoring: recent deployments for the linked project.
  const [events, setEvents] = useState<DeployEvent[]>([]);

  // The platforms the user has connected a token for (deploy targets to offer).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/deploy/connections", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled || !res.ok || !json?.ok) return;
        const providers = (json.data.providers ?? []) as Omit<DeployPlatform, "connected">[];
        const conn = (json.data.connections ?? {}) as Record<string, boolean>;
        const list = providers
          .filter((p) => p.implemented)
          .map((p) => ({ ...p, connected: Boolean(conn[p.name]) }));
        setPlatforms(list);
        // Default to a connected platform (Vercel first) so Deploy works in one click.
        const firstConnected = list.find((p) => p.connected);
        if (firstConnected) setProvider(firstConnected.name);
      } catch {
        // offline / no platforms — the dialog still shows the connect hint.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/deploy`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        const data = json.data as DeployInfo;
        setInfo(data);
        // Linked → pull recent deployments for the monitor view.
        if (data.linked) {
          fetch(`/api/workspaces/${workspaceId}/deploy/logs`, { cache: "no-store" })
            .then((r) => r.json())
            .then((j) => {
              if (j?.ok) setEvents((j.data.events ?? []) as DeployEvent[]);
            })
            .catch(() => {});
        }
      } else setInfo({ linked: false });
    } catch {
      setInfo({ linked: false });
    }
    setLoading(false);
  }, [workspaceId]);

  // Run the pre-deploy gate (security scan + tests + weight) when we have a repo.
  const runPreflight = useCallback(async () => {
    setPreflightLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/deploy/preflight`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setPreflight(json.data as PreflightReport);
    } catch {
      // best-effort — the deploy button still works
    }
    setPreflightLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hasRepo) void runPreflight();
  }, [hasRepo, runPreflight]);

  const chosen = platforms.find((p) => p.name === provider);
  const chosenLabel = chosen?.label ?? "Vercel";

  async function deploy() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        toast(`Linked to ${chosenLabel} — your app is deploying`);
        await load();
      } else {
        toast(json?.error?.message ?? "Couldn't deploy.");
      }
    } catch {
      toast("Couldn't deploy.");
    }
    setBusy(false);
  }

  const pill = info?.state ? (STATE_PILL[info.state] ?? STATE_PILL.UNKNOWN) : null;
  const liveUrl = info?.deploymentUrl || info?.productionUrl;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(460px,92vw)]">
        <DialogHeader title="Deploy" description="Ship this workspace to a hosting platform." />
        <div className="p-5">
          {loading ? (
            <div className="grid place-items-center py-6 text-sm text-txt3">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !hasRepo ? (
            <div className="flex items-start gap-2 rounded-card border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_8%,transparent)] p-3 text-[12.5px] text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Push this workspace to a git repo first (the Push button), then deploy — the platform builds from
              your repo.
            </div>
          ) : info?.linked ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-txt">{info.projectName}</span>
                <span className="text-[11px] uppercase tracking-wide text-txt3">on {info.provider}</span>
                {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
              </div>
              {liveUrl && (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] text-accent transition-colors hover:brightness-110"
                >
                  {liveUrl.replace(/^https?:\/\//, "")} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <p className="flex items-center gap-1.5 text-[12px] text-txt2">
                <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
                Auto-deploys on every push to your repo.
              </p>
              {/* Monitor: recent deployments pulled live from the platform. */}
              {events.length > 0 && (
                <div className="rounded-card border border-border2 bg-panel2/50 p-3">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-txt3">
                    Recent deployments
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 5).map((e) => {
                      const p = STATE_PILL[e.state] ?? STATE_PILL.UNKNOWN;
                      return (
                        <div key={e.id} className="flex items-center gap-2 text-[12px]">
                          <Pill tone={p.tone}>{p.label}</Pill>
                          <span className="text-txt3">{e.target ?? "production"}</span>
                          {e.createdAt && <span className="ml-auto text-[11px] text-txt3">{timeAgo(e.createdAt)}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" onClick={() => void load()} disabled={busy}>
                  <RotateCw className="h-3.5 w-3.5" /> Refresh status
                </Button>
                {info.dashboardUrl && (
                  <a
                    href={info.dashboardUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border2 px-3 py-1.5 text-xs text-txt2 transition-colors hover:border-accent hover:text-txt"
                  >
                    Open dashboard <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          ) : platforms.some((p) => p.connected) ? (
            <div className="space-y-3">
              <p className="text-[13px] text-txt2">
                Link this workspace&apos;s repo to a platform — it builds and goes live now, and redeploys
                automatically on every future push.
              </p>
              {platforms.filter((p) => p.connected).length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {platforms
                    .filter((p) => p.connected)
                    .map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setProvider(p.name)}
                        className={cn(
                          "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                          provider === p.name
                            ? "border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-txt"
                            : "border-border2 text-txt2 hover:border-accent hover:text-txt",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                </div>
              )}
              {/* Pre-deploy pipeline: real security scan + tests + weight. */}
              {(preflightLoading || preflight) && (
                <div className="rounded-card border border-border2 bg-panel2/50 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-txt3">
                    Pre-deploy checks
                    {preflightLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  </div>
                  {preflight?.checks.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 py-1 text-[12px]">
                      <span className="mt-0.5">
                        <CheckIcon status={c.status} />
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-txt">{c.label}</span>
                        <span className="text-txt3"> — {c.detail}</span>
                      </span>
                    </div>
                  ))}
                  {preflight && !preflight.ok && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-bad">
                      <CircleSlash className="h-3.5 w-3.5 shrink-0" /> Fix the blocking issue above before deploying.
                    </p>
                  )}
                </div>
              )}
              <Button
                onClick={() => void deploy()}
                disabled={busy || preflightLoading || (preflight ? !preflight.ok : false)}
                className="w-full justify-center"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                Deploy to {chosenLabel}
              </Button>
              {chosen && (
                <p className="text-[11px] text-txt3">
                  {chosenLabel} deploys from {chosen.supportedGitHosts.map((h) => h.charAt(0).toUpperCase() + h.slice(1)).join(", ")}.
                  Connect more platforms in Settings → Deployments.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-card border border-border2 p-3 text-[12.5px] text-txt2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-txt3" />
              Connect a platform (Vercel, Netlify, Cloudflare Pages, or Render) in Settings → Deployments, then
              deploy here.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
