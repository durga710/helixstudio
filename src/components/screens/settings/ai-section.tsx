"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { AlertTriangle, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { MODEL_PRESETS } from "@/lib/model-presets";

type ProviderId = "openai" | "anthropic" | "local";
const KEY_FIELD: Record<ProviderId, "openaiKey" | "anthropicKey" | "localKey"> = {
  openai: "openaiKey",
  anthropic: "anthropicKey",
  local: "localKey",
};

interface Prefs {
  aiProvider: string;
  aiModel: string;
  aiBaseUrl: string;
  keySet: { openai: boolean; anthropic: boolean; local: boolean };
  serverKeys: { openai: boolean; anthropic: boolean };
  githubTokenSet: boolean;
  githubOauthConnected?: boolean;
}

async function patchPreferences(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return json?.error?.message ?? "Couldn't save.";
    return null;
  } catch {
    return "Network error.";
  }
}

/**
 * Editor AI & GitHub preferences (migrated from GCODE): which model powers
 * the editor's agent, per-provider BYO keys, and the GitHub connection used
 * for repo import/push — OAuth status plus an optional fine-grained-PAT
 * override.
 */
export function AiSection() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const [provider, setProvider] = useState<ProviderId>("openai");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keySet, setKeySet] = useState({ openai: false, anthropic: false, local: false });
  const [aiSaving, setAiSaving] = useState(false);

  const [tokenSet, setTokenSet] = useState(false);
  const [token, setToken] = useState("");
  const [ghSaving, setGhSaving] = useState(false);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const d = (json?.data ?? json) as Prefs;
        setPrefs(d);
        const p = (["openai", "anthropic", "local"].includes(d.aiProvider) ? d.aiProvider : "openai") as ProviderId;
        setProvider(p);
        setModel(d.aiModel);
        setBaseUrl(d.aiBaseUrl ?? "");
        setKeySet(d.keySet);
        setTokenSet(d.githubTokenSet);
      })
      .catch(() => setUnavailable(true));
  }, []);

  if (unavailable) return null;

  const preset = MODEL_PRESETS[provider] ?? MODEL_PRESETS.openai;
  const apiKeySet = keySet[provider];
  const keyMissing =
    prefs !== null &&
    ((provider === "openai" && !prefs.serverKeys.openai && !apiKeySet) ||
      (provider === "anthropic" && !prefs.serverKeys.anthropic && !apiKeySet));

  async function saveAi() {
    setAiSaving(true);
    const err = await patchPreferences({
      aiProvider: provider,
      aiModel: model,
      ...(provider === "local" ? { aiBaseUrl: baseUrl } : {}),
      ...(apiKey.trim() ? { [KEY_FIELD[provider]]: apiKey.trim() } : {}),
    });
    if (!err && apiKey.trim()) {
      setKeySet((k) => ({ ...k, [provider]: true }));
      setApiKey("");
    }
    toast(err ?? "Saved — editor chats use this model from now on.");
    setAiSaving(false);
  }

  async function removeKey() {
    const err = await patchPreferences({ [KEY_FIELD[provider]]: "" });
    if (!err) {
      setKeySet((k) => ({ ...k, [provider]: false }));
      toast("Key removed — back to the server key.");
    }
  }

  async function saveGithub(clear: boolean) {
    setGhSaving(true);
    const err = await patchPreferences({ githubToken: clear ? "" : token.trim() });
    if (!err) {
      setTokenSet(!clear);
      setToken("");
      toast(clear ? "Token removed — back to your GitHub sign-in." : "Token saved — it now overrides your OAuth connection.");
    } else {
      toast(err);
    }
    setGhSaving(false);
  }

  return (
    <>
      {/* Editor AI model */}
      <h3 className="mb-[11px] mt-6 text-sm font-semibold">Editor AI model</h3>
      <Card className="p-[18px]">
        <p className="mb-3 text-xs text-txt2">
          The brain behind the editor&apos;s workspace agent. Presets are shortcuts — any model id the
          provider supports works.
        </p>
        <div className="mb-3">
          <Segmented<ProviderId>
            aria-label="Editor AI provider"
            value={provider}
            onChange={(p) => {
              setProvider(p);
              setModel(MODEL_PRESETS[p].models[0]);
            }}
            options={(Object.entries(MODEL_PRESETS) as [ProviderId, (typeof MODEL_PRESETS)[string]][]).map(
              ([value, p]) => ({ value, label: p.label }),
            )}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={preset.models.includes(model) ? model : "__custom"}
            onChange={(e) => e.target.value !== "__custom" && setModel(e.target.value)}
            aria-label="Model preset"
            className="rounded-[9px] border border-border2 bg-panel2 px-2 py-2 font-mono text-xs outline-none focus:border-accent"
          >
            {preset.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value="__custom">custom…</option>
          </select>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model id"
            aria-label="Model id"
            className="font-mono text-xs"
          />
        </div>
        {provider === "local" && (
          <div className="mt-3">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="Server URL (OpenAI-compatible) — https://my-tunnel.example.com/v1"
              aria-label="Local server URL"
              className="font-mono text-xs"
            />
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeySet ? "key saved — paste to replace" : "API key (used instead of the server key)"}
            aria-label="Provider API key"
            autoComplete="off"
            className="font-mono text-xs"
          />
          {apiKeySet && (
            <Button variant="ghost" onClick={removeKey}>
              Remove key
            </Button>
          )}
        </div>
        <p className="mt-2.5 text-[11px] text-txt3">{preset.hint}</p>
        {apiKeySet && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ok">
            <Check className="h-3.5 w-3.5 shrink-0" /> Your {preset.label} key is connected.
          </p>
        )}
        {keyMissing && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warn">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            No {preset.label} key on the server — paste yours above to use this provider.
          </p>
        )}
        <div className="mt-3">
          <Button onClick={saveAi} disabled={aiSaving || prefs === null}>
            {aiSaving ? "Saving…" : "Save model"}
          </Button>
        </div>
      </Card>

      {/* GitHub connection */}
      <h3 className="mb-[11px] mt-6 text-sm font-semibold">GitHub connection</h3>
      <Card className="p-[18px]">
        <div className="mb-3 flex items-center gap-2">
          <Pill tone={prefs?.githubOauthConnected || tokenSet ? "green" : "amber"}>
            {prefs === null
              ? "checking…"
              : tokenSet
                ? "token override"
                : prefs.githubOauthConnected
                  ? "connected"
                  : "not connected"}
          </Pill>
          <span className="text-xs text-txt2">
            {tokenSet
              ? "Your fine-grained token is used for all GitHub operations."
              : prefs?.githubOauthConnected
                ? "Connected via GitHub sign-in — repo import and push are live."
                : "Sign in with GitHub (or paste a token below) to import and push repos from the editor."}
          </span>
        </div>
        <Button variant="ghost" onClick={() => void signIn("github", { callbackUrl: "/settings" })}>
          {prefs?.githubOauthConnected ? "Reconnect GitHub" : "Connect GitHub"}
        </Button>
        <p className="mt-2 text-[11px] text-txt3">
          Reconnecting refreshes the token — use it if GitHub access ever stops working (e.g. after
          revoking the app).
        </p>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs text-txt2">
            Prefer tighter scopes? Paste a fine-grained token — it overrides the OAuth connection for
            all GitHub operations.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_… or ghp_… (Contents + Pull requests read/write)"
              aria-label="GitHub fine-grained token"
              autoComplete="off"
              className="font-mono text-xs"
            />
            <Button onClick={() => void saveGithub(false)} disabled={ghSaving || !token.trim()}>
              {ghSaving ? "Saving…" : "Save token"}
            </Button>
            {tokenSet && (
              <Button variant="ghost" onClick={() => void saveGithub(true)} disabled={ghSaving}>
                Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-txt3">
            GitHub → Settings → Developer settings → Fine-grained tokens. Grant the repos you&apos;ll work
            on, with Contents and Pull requests read &amp; write (+ Administration to create new repos).
          </p>
        </div>
      </Card>
    </>
  );
}
