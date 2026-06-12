"use client";

/**
 * Settings → Deployments: connect a hosting platform so the editor can
 * git-link a workspace's repo and let the platform auto-deploy on every
 * push. Vercel is live; the others show as coming-soon so the roadmap is
 * visible. Mirrors the git-host connection rows.
 */

import { useEffect, useState } from "react";
import { Check, Loader2, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface ProviderMeta {
  name: string;
  label: string;
  implemented: boolean;
}

const HINTS: Record<string, { hint: string; tokenUrl: string; hasTeam?: boolean }> = {
  vercel: {
    hint: "Create a token at vercel.com/account/tokens. For a Team account, also paste the Team ID (Settings → General).",
    tokenUrl: "https://vercel.com/account/tokens",
    hasTeam: true,
  },
};

export function DeploySection() {
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    fetch("/api/deploy/connections")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        const d = j?.data ?? j;
        setProviders(d.providers ?? []);
        setConnections(d.connections ?? {});
      })
      .catch(() => setUnavailable(true));
  }, []);

  if (unavailable) return null;

  return (
    <>
      <h3 className="mb-[11px] mt-6 flex items-center gap-2 text-sm font-semibold">
        <Rocket className="h-4 w-4 text-accent" /> Deployments
      </h3>
      <Card className="p-[18px]">
        <p className="mb-3 text-xs text-txt2">
          Connect a hosting platform, then deploy any workspace from the editor. Helix links your GitHub repo to a
          project on the platform — after that, <b>every push auto-deploys</b>.
        </p>
        {providers.map((p, i) => (
          <DeployRow
            key={p.name}
            provider={p}
            connected={connections[p.name] ?? false}
            divider={i > 0}
            onConnectedChange={(v) => setConnections((c) => ({ ...c, [p.name]: v }))}
          />
        ))}
      </Card>
    </>
  );
}

function DeployRow({
  provider,
  connected,
  divider,
  onConnectedChange,
}: {
  provider: ProviderMeta;
  connected: boolean;
  divider: boolean;
  onConnectedChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const meta = HINTS[provider.name];
  const [token, setToken] = useState("");
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(clear: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/deploy/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.name,
          token: clear ? "" : token.trim(),
          ...(meta?.hasTeam && teamId.trim() ? { config: { teamId: teamId.trim() } } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast(json?.error?.message ?? "Couldn't save.");
      } else {
        onConnectedChange(!clear);
        setToken("");
        if (clear) setTeamId("");
        toast(clear ? `${provider.label} disconnected.` : `${provider.label} connected.`);
      }
    } catch {
      toast("Network error.");
    }
    setSaving(false);
  }

  return (
    <div className={divider ? "mt-4 border-t border-border pt-4" : ""}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-medium">{provider.label}</span>
        {!provider.implemented ? (
          <Pill tone="neutral">coming soon</Pill>
        ) : connected ? (
          <Pill tone="green">
            <Check className="h-3 w-3" /> connected
          </Pill>
        ) : (
          <Pill tone="amber">not connected</Pill>
        )}
      </div>

      {provider.implemented && (
        <>
          <div className="flex flex-wrap gap-2">
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={connected ? "token saved — paste to replace" : `${provider.label} API token`}
              autoComplete="off"
              className="min-w-[220px] flex-1 font-mono text-xs"
            />
            {meta?.hasTeam && (
              <Input
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                placeholder="Team ID (optional)"
                className="max-w-[200px] font-mono text-xs"
              />
            )}
          </div>
          {meta?.hint && <p className="mt-2 text-[11px] text-txt3">{meta.hint}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void save(false)} disabled={saving || !token.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {connected ? "Update" : "Connect"}
            </Button>
            {connected && (
              <Button variant="ghost" onClick={() => void save(true)} disabled={saving}>
                Disconnect
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
