/* eslint-disable react-hooks/set-state-in-effect -- ported GCODE studio code; its fetch-on-mount/poll effects predate this rule and behave correctly */
"use client";

import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MODEL_PRESETS } from "@/lib/model-presets";
import { KeyStatusDot, validateAiKey, type KeyState } from "@/components/studio/key-status";

interface Prefs {
  aiProvider: string;
  aiModel: string;
  aiBaseUrl: string;
  keySet: { openai: boolean; anthropic: boolean; local: boolean; gemini: boolean };
  serverKeys: { openai: boolean; anthropic: boolean; gemini: boolean };
}

type CloudProvider = "openai" | "anthropic" | "gemini";

const fieldCls =
  "rounded-lg border border-border2 bg-bg2 px-2 py-1.5 font-mono text-[11px] text-txt placeholder:text-txt3 focus:border-accent focus:outline-none";

/**
 * Compact model switcher for the chat header. Edits the same per-user
 * preferences as the Settings page (PATCH /api/preferences) — the chat
 * route reads them fresh on every message, so the change applies to the
 * very next turn.
 *
 * For the Custom/Local provider it queries the endpoint's /models list
 * (via /api/local-models) so the user picks from what's ACTUALLY running.
 */
export function ModelPicker() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [open, setOpen] = useState(false);

  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:1234/v1");
  const [apiKey, setApiKey] = useState("");
  // "shared" = the app's own env key (owner-funded, available to everyone);
  // "own" = the user's personal key.
  const [keyMode, setKeyMode] = useState<"shared" | "own">("shared");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Live model list from the custom endpoint
  const [liveModels, setLiveModels] = useState<string[] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [listing, setListing] = useState(false);

  // Key validity for the saved provider (so the user knows the AI works
  // before chatting). Checked on open and after a save.
  const [keyState, setKeyState] = useState<KeyState>("idle");
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const checkKey = useCallback(async (p: string) => {
    if (p !== "openai" && p !== "anthropic" && p !== "local" && p !== "gemini") return;
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled || !res.ok || !json?.ok) return;
        setPrefs(json.data);
        setProvider(json.data.aiProvider);
        setModel(json.data.aiModel);
        if (json.data.aiBaseUrl) setBaseUrl(json.data.aiBaseUrl);
        // Default to "own key" only if the user already saved one.
        const ks = json.data.keySet as Prefs["keySet"];
        setKeyMode(ks[json.data.aiProvider as keyof Prefs["keySet"]] ? "own" : "shared");
        // Surface key status on the chip without needing to open the picker.
        void checkKey(json.data.aiProvider);
      } catch {
        // chip just shows defaults
      }
    })();
    return () => {
      cancelled = true;
    };
    // checkKey is a stable useCallback; this runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listLocalModels = useCallback(
    async (base: string) => {
      if (!/^https?:\/\//.test(base)) return;
      setListing(true);
      setLiveError(null);
      try {
        const res = await fetch(`/api/local-models?base=${encodeURIComponent(base)}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          setLiveModels(json.data.models);
          // The API reports which URL variant actually worked (e.g. the
          // user pasted the bare host without /v1) — adopt it.
          if (json.data.base && json.data.base !== base) setBaseUrl(json.data.base);
          // Auto-select the first running model if none chosen yet
          if (json.data.models.length > 0 && !json.data.models.includes(model)) {
            setModel(json.data.models[0]);
          }
          if (json.data.models.length === 0) setLiveError("Server is up but no chat models are loaded.");
        } else {
          setLiveModels(null);
          setLiveError(json?.error?.message ?? "Couldn't list models.");
        }
      } catch {
        setLiveModels(null);
        setLiveError("Couldn't list models.");
      }
      setListing(false);
    },
    [model],
  );

  // When the picker opens on the local provider, fetch what's running.
  useEffect(() => {
    if (open && provider === "local") void listLocalModels(baseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider]);

  // Check the saved key whenever the picker opens or the provider changes.
  useEffect(() => {
    if (open) void checkKey(provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider]);

  const preset = MODEL_PRESETS[provider] ?? MODEL_PRESETS.openai;
  const modelOptions = provider === "local" && liveModels?.length ? liveModels : preset.models;
  const keySaved = prefs?.keySet?.[provider as keyof Prefs["keySet"]] ?? false;

  const chipModel = prefs ? prefs.aiModel || "default" : "…";
  const chipProvider = prefs ? (MODEL_PRESETS[prefs.aiProvider]?.label ?? prefs.aiProvider) : "";

  async function save() {
    setSaving(true);
    setNote(null);
    if (provider === "local" && !/^https?:\/\//.test(baseUrl.trim())) {
      setNote("Enter a valid http(s) endpoint URL.");
      setSaving(false);
      return;
    }
    if (provider === "local" && !model.trim()) {
      setNote("Pick or type a model id (use ↻ to list what's running).");
      setSaving(false);
      return;
    }
    if (provider !== "local" && keyMode === "own" && !apiKey.trim() && !keySaved) {
      setNote("Paste your key — or choose the shared key.");
      setSaving(false);
      return;
    }
    try {
      const keyField =
        provider === "openai"
          ? "openaiKey"
          : provider === "anthropic"
            ? "anthropicKey"
            : provider === "gemini"
              ? "geminiKey"
              : "localKey";
      // "Shared key" clears any saved personal key so the chat falls back to
      // the app's env key. "Own key" saves a new key if one was typed.
      const keyPatch =
        provider !== "local" && keyMode === "shared"
          ? { [keyField]: "" }
          : apiKey.trim()
            ? { [keyField]: apiKey.trim() }
            : {};
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiProvider: provider,
          aiModel: model.trim(),
          ...(provider === "local" ? { aiBaseUrl: baseUrl.trim() } : {}),
          ...keyPatch,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setNote(json?.error?.message ?? "Couldn't save.");
      } else {
        setPrefs((p) => {
          const keySet = {
            openai: p?.keySet.openai ?? false,
            anthropic: p?.keySet.anthropic ?? false,
            local: p?.keySet.local ?? false,
            gemini: p?.keySet.gemini ?? false,
          };
          const k = provider as keyof typeof keySet;
          if (provider !== "local" && keyMode === "shared") keySet[k] = false;
          else if (apiKey.trim()) keySet[k] = true;
          return {
            aiProvider: provider,
            aiModel: model.trim(),
            aiBaseUrl: baseUrl,
            keySet,
            serverKeys: p?.serverKeys ?? { openai: false, anthropic: false, gemini: false },
          };
        });
        setApiKey("");
        void checkKey(provider); // verify the just-saved key
        setOpen(false);
      }
    } catch {
      setNote("Network error.");
    }
    setSaving(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-border bg-panel2 px-2.5 py-1.5
                   font-mono text-[11px] text-txt2 transition-colors hover:border-accent hover:text-txt"
        title="Choose the AI model for this chat"
      >
        <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="truncate">
          {chipProvider && <span className="text-txt3">{chipProvider} · </span>}
          {chipModel}
        </span>
        {(keyState === "valid" || keyState === "invalid") && (
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", keyState === "valid" ? "bg-ok" : "bg-bad")}
            title={keyState === "valid" ? "AI key works" : keyMsg ?? "Invalid API key"}
          />
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-txt3" />
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
          {/* Solid panel — opaque so the form reads clearly over any background */}
          <div
            className="fade-up absolute right-0 top-full z-50 mt-2 w-[22rem] space-y-3 rounded-card-lg border
                       border-border2 bg-panel p-4 shadow-pop"
          >
            <div>
              <label className="label-tactical mb-1.5 block">
                Provider
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(MODEL_PRESETS).map(([key, p]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setProvider(key);
                      setModel(key === "local" ? "" : MODEL_PRESETS[key].models[0]);
                      setNote(null);
                      setKeyMode(prefs?.keySet?.[key as keyof Prefs["keySet"]] ? "own" : "shared");
                      if (key === "local") void listLocalModels(baseUrl);
                    }}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                      provider === key
                        ? "border-accent bg-hl text-accent"
                        : "border-border2 text-txt2 hover:border-accent hover:text-txt",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {provider === "local" && (
              <div>
                <label className="label-tactical mb-1.5 block">
                  Endpoint URL (OpenAI-compatible)
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    onBlur={() => void listLocalModels(baseUrl)}
                    placeholder="http://localhost:1234/v1"
                    className={cn(fieldCls, "min-w-0 flex-1")}
                  />
                  <button
                    type="button"
                    aria-label="List models running on this endpoint"
                    title="List models running on this endpoint"
                    onClick={() => void listLocalModels(baseUrl)}
                    className="shrink-0 rounded-lg border border-border2 px-2 text-txt2 transition-colors hover:border-accent hover:text-txt"
                  >
                    {listing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {liveError && <p className="mt-1 text-[10px] text-warn">{liveError}</p>}
                {liveModels && liveModels.length > 0 && (
                  <p className="mt-1 text-[10px] text-ok">
                    {liveModels.length} model(s) running — pick one below.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="label-tactical mb-1.5 block">
                Model — any id your provider supports
              </label>
              <div className="flex gap-1.5">
                <select
                  value={modelOptions.includes(model) ? model : "__custom"}
                  onChange={(e) => e.target.value !== "__custom" && setModel(e.target.value)}
                  className={cn(fieldCls, "max-w-[10rem] px-1.5")}
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m} className="bg-panel">
                      {m}
                    </option>
                  ))}
                  <option value="__custom" className="bg-panel">
                    custom…
                  </option>
                </select>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="model id"
                  className={cn(fieldCls, "min-w-0 flex-1")}
                />
              </div>
            </div>

            {provider === "local" ? (
              <div>
                <label className="label-tactical mb-1.5 block">
                  API key {keySaved && <span className="normal-case text-ok">· saved</span>}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={keySaved ? "saved — paste to replace" : "optional (LM Studio needs none)"}
                  className={cn(fieldCls, "w-full")}
                />
              </div>
            ) : (
              <div>
                <label className="label-tactical mb-1.5 block">
                  {preset.label} API key
                </label>
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="keymode"
                      checked={keyMode === "shared"}
                      onChange={() => setKeyMode("shared")}
                      className="mt-0.5 accent-accent"
                    />
                    <span className="text-[11px] leading-snug">
                      <span className="text-txt">Use the app&apos;s platform key</span>{" "}
                      {prefs?.serverKeys?.[provider as CloudProvider] ? (
                        <span className="text-ok">· available</span>
                      ) : (
                        <span className="text-warn">· admins only — add your own key</span>
                      )}
                      <span className="block text-txt3">No setup — usage is paid by the app (admins only).</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="keymode"
                      checked={keyMode === "own"}
                      onChange={() => setKeyMode("own")}
                      className="mt-0.5 accent-accent"
                    />
                    <span className="text-[11px] leading-snug">
                      <span className="text-txt">Use my own key</span>{" "}
                      {keySaved && <span className="text-ok">· saved</span>}
                      <span className="block text-txt3">Your key, your billing.</span>
                    </span>
                  </label>
                  {keyMode === "own" && (
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={keySaved ? "saved — paste to replace" : "sk-…"}
                      className={cn(fieldCls, "w-full")}
                    />
                  )}
                </div>
              </div>
            )}

            <p className="text-[10px] leading-relaxed text-txt3">{preset.hint}</p>

            {note && <p className="text-[11px] text-warn">{note}</p>}

            <div className="flex min-h-[16px] items-center justify-between">
              <KeyStatusDot state={keyState} message={keyMsg} />
              <button
                type="button"
                onClick={() => void checkKey(provider)}
                disabled={keyState === "checking"}
                className="text-[10.5px] text-txt3 transition-colors hover:text-txt disabled:opacity-50"
              >
                re-check
              </button>
            </div>

            <Button
              onClick={() => void save()}
              disabled={saving}
              className="w-full justify-center"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Use this model
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
