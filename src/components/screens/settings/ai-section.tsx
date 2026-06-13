"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { AlertTriangle, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { MODEL_PRESETS } from "@/lib/model-presets";
import { PROVIDER_META, type GitProviderName } from "@/lib/git/meta";
import { KeyStatusDot, validateAiKey, type KeyState } from "@/components/studio/key-status";

type ProviderId = "openai" | "anthropic" | "local" | "gemini";
const KEY_FIELD: Record<ProviderId, "openaiKey" | "anthropicKey" | "localKey" | "geminiKey"> = {
  openai: "openaiKey",
  anthropic: "anthropicKey",
  local: "localKey",
  gemini: "geminiKey",
};
const PROVIDER_IDS: ProviderId[] = ["openai", "anthropic", "gemini", "local"];

interface Prefs {
  aiProvider: string;
  aiModel: string;
  aiBaseUrl: string;
  keySet: { openai: boolean; anthropic: boolean; local: boolean; gemini: boolean };
  serverKeys: { openai: boolean; anthropic: boolean; gemini: boolean };
  githubTokenSet: boolean;
  githubOauthConnected?: boolean;
  gitConnections?: Partial<Record<GitProviderName, boolean>>;
  gitConfig?: { gitlabBaseUrl?: string | null; azureOrg?: string | null; giteaBaseUrl?: string | null };
}

type GitHostName = Exclude<GitProviderName, "github">;

const GIT_HOSTS: GitHostName[] = ["gitlab", "bitbucket", "azure", "gitea"];

/** PATCH /api/preferences field names per git host. */
const GIT_HOST_FIELDS: Record<GitHostName, { token: string; baseUrl?: string; org?: string }> = {
  gitlab: { token: "gitlabToken", baseUrl: "gitlabBaseUrl" },
  bitbucket: { token: "bitbucketToken" },
  azure: { token: "azureToken", org: "azureOrg" },
  gitea: { token: "giteaToken", baseUrl: "giteaBaseUrl" },
};

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
 * Editor AI & git preferences (migrated from GCODE): which model powers
 * the editor's agent, per-provider BYO keys, and the git connections used
 * for repo import/push — GitHub OAuth status plus an optional
 * fine-grained-PAT override, and token-based connections for GitLab,
 * Bitbucket, Azure DevOps, and Gitea/Forgejo.
 */
export function AiSection() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const [provider, setProvider] = useState<ProviderId>("openai");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keySet, setKeySet] = useState({ openai: false, anthropic: false, local: false, gemini: false });
  const [aiSaving, setAiSaving] = useState(false);
  const [keyState, setKeyState] = useState<KeyState>("idle");
  const [keyMsg, setKeyMsg] = useState<string | null>(null);

  // Live model list (what the active key can access) — dynamic per key, so the
  // dropdown shows real options instead of static guesses. Cloud providers only;
  // `local` keeps the free-text id (its models come from the endpoint URL).
  const [liveModels, setLiveModels] = useState<string[] | null>(null);
  const loadModels = useCallback(async (p: ProviderId) => {
    if (p === "local") {
      setLiveModels(null);
      return;
    }
    try {
      const res = await fetch(`/api/ai/models?provider=${p}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      setLiveModels(res.ok && json?.ok ? (json.data.models as string[]) : null);
    } catch {
      setLiveModels(null);
    }
  }, []);

  // Validate the saved config for a provider and reflect it in the dot.
  async function checkKey(p: ProviderId) {
    setKeyState("checking");
    setKeyMsg(null);
    const v = await validateAiKey(p);
    if (!v) {
      setKeyState("invalid");
      setKeyMsg("Couldn't check the key");
      return;
    }
    setKeyState(v.valid ? "valid" : "invalid");
    setKeyMsg(v.reason ?? null);
  }

  const [tokenSet, setTokenSet] = useState(false);
  const [token, setToken] = useState("");
  const [ghSaving, setGhSaving] = useState(false);
  const [gitConn, setGitConn] = useState<Partial<Record<GitProviderName, boolean>>>({});

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const d = (json?.data ?? json) as Prefs;
        setPrefs(d);
        const p = (PROVIDER_IDS.includes(d.aiProvider as ProviderId) ? d.aiProvider : "openai") as ProviderId;
        setProvider(p);
        setModel(d.aiModel);
        setBaseUrl(d.aiBaseUrl ?? "");
        setKeySet(d.keySet);
        setTokenSet(d.githubTokenSet);
        setGitConn(d.gitConnections ?? {});
        // Show the saved provider's key status on load + list its live models.
        void checkKey(p);
        void loadModels(p);
      })
      .catch(() => setUnavailable(true));
  }, []);

  if (unavailable) return null;

  const preset = MODEL_PRESETS[provider] ?? MODEL_PRESETS.openai;
  // Live list (dynamic per key) when available, else the static presets.
  const modelOptions = liveModels?.length ? liveModels : preset.models;
  const apiKeySet = keySet[provider];
  // Platform (server) keys are admin-only — serverKeys reflects what THIS user
  // can actually use, so a non-admin always sees "bring your own key".
  const keyMissing =
    prefs !== null && provider !== "local" && !prefs.serverKeys[provider] && !apiKeySet;

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
    // Verify the just-saved key against the provider.
    if (!err) void checkKey(provider);
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
              void checkKey(p); // reflect the newly-selected provider's saved key
              void loadModels(p); // list models this provider's key can access
            }}
            options={(Object.entries(MODEL_PRESETS) as [ProviderId, (typeof MODEL_PRESETS)[string]][]).map(
              ([value, p]) => ({ value, label: p.label }),
            )}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={modelOptions.includes(model) ? model : "__custom"}
            onChange={(e) => e.target.value !== "__custom" && setModel(e.target.value)}
            aria-label="Model preset"
            className="rounded-[9px] border border-border2 bg-panel2 px-2 py-2 font-mono text-xs outline-none focus:border-accent"
          >
            {modelOptions.map((m) => (
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
            No {preset.label} key available — paste your own above to use this provider.
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={saveAi} disabled={aiSaving || prefs === null}>
            {aiSaving ? "Saving…" : "Save model"}
          </Button>
          <KeyStatusDot state={keyState} message={keyMsg} />
        </div>
      </Card>

      {/* Git connections */}
      <h3 className="mb-[11px] mt-6 text-sm font-semibold">Git connections</h3>
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

        {/* Other git hosts — token-based connections */}
        {prefs !== null &&
          GIT_HOSTS.map((host) => (
            <GitHostRow
              key={host}
              host={host}
              connected={Boolean(gitConn[host])}
              initialBaseUrl={
                (host === "gitlab"
                  ? prefs.gitConfig?.gitlabBaseUrl
                  : host === "gitea"
                    ? prefs.gitConfig?.giteaBaseUrl
                    : "") ?? ""
              }
              initialOrg={(host === "azure" ? prefs.gitConfig?.azureOrg : "") ?? ""}
              onConnectedChange={(v) => setGitConn((c) => ({ ...c, [host]: v }))}
            />
          ))}
      </Card>
    </>
  );
}

/**
 * One divider-separated settings row per non-GitHub git host: connection
 * status, token input, host-specific extras (server URL / organization),
 * Save and Remove.
 */
function GitHostRow({
  host,
  connected,
  initialBaseUrl,
  initialOrg,
  onConnectedChange,
}: {
  host: GitHostName;
  connected: boolean;
  initialBaseUrl: string;
  initialOrg: string;
  onConnectedChange: (connected: boolean) => void;
}) {
  const { toast } = useToast();
  const meta = PROVIDER_META[host];
  const fields = GIT_HOST_FIELDS[host];

  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [org, setOrg] = useState(initialOrg);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const body: Record<string, string> = {};
    if (token.trim()) body[fields.token] = token.trim();
    if (fields.baseUrl) body[fields.baseUrl] = baseUrl.trim();
    if (fields.org) body[fields.org] = org.trim();
    const err = await patchPreferences(body);
    if (!err) {
      if (token.trim()) onConnectedChange(true);
      setToken("");
      toast(`${meta.label} saved — import and push are live.`);
    } else {
      toast(err);
    }
    setSaving(false);
  }

  async function remove() {
    setSaving(true);
    const body: Record<string, string> = { [fields.token]: "" };
    if (fields.baseUrl) body[fields.baseUrl] = "";
    if (fields.org) body[fields.org] = "";
    const err = await patchPreferences(body);
    if (!err) {
      onConnectedChange(false);
      setToken("");
      setBaseUrl("");
      setOrg("");
      toast(`${meta.label} disconnected.`);
    } else {
      toast(err);
    }
    setSaving(false);
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-txt">{meta.label}</span>
        <Pill tone={connected ? "green" : "amber"}>{connected ? "connected" : "not connected"}</Pill>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={connected ? "token saved — paste to replace" : meta.tokenPlaceholder}
          aria-label={`${meta.label} access token`}
          autoComplete="off"
          className="min-w-[12rem] flex-1 font-mono text-xs"
        />
        {fields.baseUrl && (
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={meta.baseUrlPlaceholder}
            aria-label={`${meta.label} server URL`}
            className="min-w-[12rem] flex-1 font-mono text-xs"
          />
        )}
        {fields.org && (
          <Input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="your-organization"
            aria-label={`${meta.label} organization`}
            className="min-w-[10rem] flex-1 font-mono text-xs"
          />
        )}
        <Button onClick={() => void save()} disabled={saving || (!token.trim() && !connected)}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {connected && (
          <Button variant="ghost" onClick={() => void remove()} disabled={saving}>
            Remove
          </Button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-txt3">{meta.tokenHelp}</p>
    </div>
  );
}
