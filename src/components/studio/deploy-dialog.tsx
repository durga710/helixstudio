/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-open dialog, same pattern as the other studio dialogs */
"use client";

/**
 * Deploy a workspace to a hosting platform. Git-linked model: it links the
 * workspace's GitHub repo to a platform project (Vercel…), and the platform
 * auto-builds on every push thereafter. Shows the live site URL + status.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Rocket, RotateCw } from "lucide-react";
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

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/deploy`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setInfo(json.data as DeployInfo);
      else setInfo({ linked: false });
    } catch {
      setInfo({ linked: false });
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deploy() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "vercel" }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        toast("Linked to Vercel — your app is deploying");
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
              Push this workspace to a GitHub repo first (the Push button), then deploy — the platform builds from
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
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-txt2">
                Link this workspace&apos;s repo to <b>Vercel</b> — it builds and goes live now, and redeploys
                automatically on every future push.
              </p>
              <Button onClick={() => void deploy()} disabled={busy} className="w-full justify-center">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                Deploy to Vercel
              </Button>
              <p className="text-[11px] text-txt3">
                Need to connect Vercel first? Settings → Deployments. New platforms (Netlify, Cloudflare Pages,
                Render) are coming.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
