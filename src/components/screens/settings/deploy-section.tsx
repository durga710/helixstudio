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

/** Optional second field some platforms need, stored in the connection config. */
interface ExtraField {
  key: string; // config key (teamId | accountId | ownerId)
  label: string;
  required?: boolean;
}

const HINTS: Record<string, { hint: string; tokenUrl: string; extra?: ExtraField }> = {
  vercel: {
    hint: "Create a token at vercel.com/account/tokens. For a Team account, also paste the Team ID (Settings → General).",
    tokenUrl: "https://vercel.com/account/tokens",
    extra: { key: "teamId", label: "Team ID (optional)" },
  },
  netlify: {
    hint: "Create a personal access token at app.netlify.com/user/applications. Netlify's GitHub app needs access to the repo.",
    tokenUrl: "https://app.netlify.com/user/applications",
  },
  cloudflare: {
    hint: "Create an API token with the Pages:Edit permission at dash.cloudflare.com/profile/api-tokens, and paste your Account ID.",
    tokenUrl: "https://dash.cloudflare.com/profile/api-tokens",
    extra: { key: "accountId", label: "Account ID", required: true },
  },
  render: {
    hint: "Create an API key at dashboard.render.com (Account Settings → API Keys), and paste your Owner ID (the usr-/tea- id).",
    tokenUrl: "https://dashboard.render.com",
    extra: { key: "ownerId", label: "Owner ID", required: true },
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
  const extra = meta?.extra;
  const [token, setToken] = useState("");
  const [extraVal, setExtraVal] = useState("");
  const [saving, setSaving] = useState(false);

  const extraMissing = Boolean(extra?.required) && !extraVal.trim();

  async function save(clear: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/deploy/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.name,
          token: clear ? "" : token.trim(),
          ...(!clear && extra && extraVal.trim() ? { config: { [extra.key]: extraVal.trim() } } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast(json?.error?.message ?? "Couldn't save.");
      } else {
        onConnectedChange(!clear);
        setToken("");
        if (clear) setExtraVal("");
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
            {extra && (
              <Input
                value={extraVal}
                onChange={(e) => setExtraVal(e.target.value)}
                placeholder={extra.label}
                className="max-w-[200px] font-mono text-xs"
              />
            )}
          </div>
          {meta?.hint && <p className="mt-2 text-[11px] text-txt3">{meta.hint}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void save(false)} disabled={saving || !token.trim() || extraMissing}>
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
