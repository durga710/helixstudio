"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Plus, Sun, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ACCENTS, useTheme, type Density, type Theme } from "@/components/theme-provider";
import { usePrefs } from "@/hooks/use-prefs";
import { timeAgo, cn } from "@/lib/utils";
import type { MemoryEntry, MemoryScope } from "@/lib/types";
import type { ModelTier, ReasoningDepth } from "@/lib/ai/provider";

function SettingRow({
  label,
  description,
  children,
  last,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-[18px] py-[15px]",
        !last && "border-b border-border"
      )}
    >
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        <div className="mt-px max-w-[420px] text-xs text-txt2">{description}</div>
      </div>
      {children}
    </div>
  );
}

const GUIDANCE_FILES = ["CLAUDE.md", "PRODUCT.md", "ARCHITECTURE.md", "DESIGN_SYSTEM.md", "TASKS.md"];

const scopeTone: Record<MemoryScope, "accent" | "green" | "amber"> = {
  user: "accent",
  project: "green",
  agent: "amber",
};

export function SettingsScreen() {
  const { theme, setTheme, accent, setAccent, density, setDensity, fontSize, setFontSize } = useTheme();
  const { prefs, update } = usePrefs();
  const { toast } = useToast();

  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [memLoading, setMemLoading] = useState(true);
  const [byok, setByok] = useState<{ byok: boolean; platformKey: boolean } | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [memError, setMemError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newScope, setNewScope] = useState<MemoryScope>("project");

  const loadMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/memory");
      if (!res.ok) throw new Error();
      setMemory(((await res.json()) as { memory: MemoryEntry[] }).memory);
      setMemError(false);
    } catch {
      setMemError(true);
    } finally {
      setMemLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadMemory();
      fetch("/api/keys")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setByok(d as { byok: boolean; platformKey: boolean }))
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(t);
  }, [loadMemory]);

  async function saveKey() {
    if (!keyInput.trim()) return;
    setKeySaving(true);
    setKeyError(null);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: keyInput.trim() }),
    });
    if (res.ok) {
      setKeyInput("");
      setByok((b) => ({ byok: true, platformKey: b?.platformKey ?? false }));
      toast("API key saved — chat now streams real Claude");
    } else {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setKeyError(err?.error ?? "Couldn't save the key");
    }
    setKeySaving(false);
  }

  async function removeKey() {
    const res = await fetch("/api/keys", { method: "DELETE" });
    if (res.ok) {
      setByok((b) => ({ byok: false, platformKey: b?.platformKey ?? false }));
      toast("API key removed");
    }
  }

  async function addMemory() {
    if (!newTitle.trim() || !newContent.trim()) return;
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: newScope, title: newTitle.trim(), content: newContent.trim() }),
    });
    if (res.ok) {
      setNewTitle("");
      setNewContent("");
      setAdding(false);
      toast("Memory saved");
      loadMemory();
    } else {
      toast("Could not save memory");
    }
  }

  async function removeMemory(id: string) {
    const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      toast("Memory deleted");
      setMemory((m) => m.filter((e) => e.id !== id));
    }
  }

  return (
    <div className="pad-screen">
      <div className="max-w-[760px]">
        <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.13em] text-accent">Workspace</div>
        <h1 className="text-[22px] font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-[13px] text-txt2">Appearance, model, agents, memory, and project guidance.</p>

        {/* Appearance */}
        <h3 className="mb-[11px] mt-6 text-sm font-semibold">Appearance</h3>
        <Card className="px-[18px] py-1">
          <SettingRow label="Theme" description="Switch between dark and light. Also in the top bar.">
            <Segmented<Theme>
              aria-label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "dark", label: (<><Moon className="h-[13px] w-[13px]" strokeWidth={1.7} />Dark</>) },
                { value: "light", label: (<><Sun className="h-[13px] w-[13px]" strokeWidth={1.7} />Light</>) },
              ]}
            />
          </SettingRow>
          <SettingRow label="Accent color" description="Applied live across the whole interface.">
            <div className="flex gap-2">
              {ACCENTS.map(([hex, name]) => (
                <button
                  key={hex}
                  title={name}
                  aria-label={`Accent: ${name}`}
                  onClick={() => setAccent(hex)}
                  className={cn(
                    "h-6 w-6 cursor-pointer rounded-card-sm border-2 transition-transform hover:scale-110",
                    accent === hex ? "border-txt" : "border-transparent"
                  )}
                  style={{ background: hex }}
                />
              ))}
            </div>
          </SettingRow>
          <SettingRow label="Density" description="Comfortable spacing, or compact to fit more on screen.">
            <Segmented<Density>
              aria-label="Density"
              value={density}
              onChange={setDensity}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
            />
          </SettingRow>
          <SettingRow
            label="Editor font size"
            description={`${fontSize}px monospace in the code editor.`}
            last
          >
            <input
              type="range"
              min={11}
              max={18}
              value={fontSize}
              aria-label="Editor font size"
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-40"
            />
          </SettingRow>
        </Card>

        {/* AI provider (BYOK) */}
        <h3 className="mb-[11px] mt-6 text-sm font-semibold">AI provider</h3>
        <Card className="p-[18px]">
          <div className="mb-3 flex items-center gap-2">
            <Pill tone={byok?.byok || byok?.platformKey ? "green" : "amber"}>
              {byok === null
                ? "checking…"
                : byok.byok
                  ? "using your key"
                  : byok.platformKey
                    ? "platform key"
                    : "demo mode"}
            </Pill>
            <span className="text-xs text-txt2">
              {byok?.byok
                ? "Chat streams real Claude with your Anthropic API key."
                : byok?.platformKey
                  ? "Chat streams real Claude with the workspace key."
                  : "Add your Anthropic API key to stream real Claude — without one, chat uses simulated responses."}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder="sk-ant-…"
              aria-label="Anthropic API key"
              autoComplete="off"
              className="font-mono text-xs"
            />
            <Button onClick={saveKey} disabled={keySaving || keyInput.trim().length < 12}>
              {keySaving ? "Saving…" : byok?.byok ? "Replace key" : "Save key"}
            </Button>
            {byok?.byok && (
              <Button variant="ghost" onClick={removeKey}>
                Remove
              </Button>
            )}
          </div>
          {keyError && <p className="mt-2 text-xs text-bad">{keyError}</p>}
          <p className="mt-2.5 text-[11px] text-txt3">
            Stored as an httpOnly cookie in your browser only — sent with your requests, never saved or
            logged on the server. Get a key at console.anthropic.com.
          </p>
        </Card>

        {/* Model & reasoning */}
        <h3 className="mb-[11px] mt-6 text-sm font-semibold">Model &amp; reasoning</h3>
        <Card className="px-[18px] py-1">
          <SettingRow label="Default model" description="Used for code generation and agent reasoning.">
            <Segmented<ModelTier>
              aria-label="Default model"
              value={prefs.model}
              onChange={(model) => update({ model })}
              options={[
                { value: "haiku", label: "Haiku" },
                { value: "sonnet", label: "Sonnet" },
                { value: "opus", label: "Opus" },
              ]}
            />
          </SettingRow>
          <SettingRow label="Reasoning depth" description="Fast for quick edits, Deep for multi-file work.">
            <Segmented<ReasoningDepth>
              aria-label="Reasoning depth"
              value={prefs.depth}
              onChange={(depth) => update({ depth })}
              options={[
                { value: "fast", label: "Fast" },
                { value: "deep", label: "Deep" },
              ]}
            />
          </SettingRow>
          <SettingRow
            label="Confirm before every action"
            description="Agents pause for approval before writing files or running migrations."
            last
          >
            <Switch
              checked={prefs.confirmActions}
              onCheckedChange={(confirmActions) => update({ confirmActions })}
              aria-label="Confirm before every action"
            />
          </SettingRow>
        </Card>

        {/* Agents */}
        <h3 className="mb-[11px] mt-6 text-sm font-semibold">Agents</h3>
        <Card className="px-[18px] py-1">
          <SettingRow
            label="Full multi-agent workflow"
            description="Architect → Engineer → Reviewer → Security → Performance on each task."
          >
            <Switch
              checked={prefs.fullWorkflow}
              onCheckedChange={(fullWorkflow) => update({ fullWorkflow })}
              aria-label="Full multi-agent workflow"
            />
          </SettingRow>
          <SettingRow
            label="Auto-run security review"
            description="Always scan diffs for auth, injection, and secret-leak risks."
            last
          >
            <Switch
              checked={prefs.autoSecurity}
              onCheckedChange={(autoSecurity) => update({ autoSecurity })}
              aria-label="Auto-run security review"
            />
          </SettingRow>
        </Card>

        {/* Memory (Phase 5) */}
        <div className="mb-[11px] mt-6 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Memory</h3>
          <Button variant="ghost" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-[15px] w-[15px]" strokeWidth={1.7} />
            Add memory
          </Button>
        </div>
        <Card className="p-[18px]">
          <p className="mb-[13px] text-xs text-txt2">
            What Helix remembers across sessions — user preferences, project decisions, and agent task
            history.
          </p>
          {adding && (
            <div className="mb-3.5 flex flex-col gap-2 rounded-[9px] border border-border2 bg-panel2 p-3">
              <div className="flex gap-2">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title"
                  aria-label="Memory title"
                  className="text-[12.5px]"
                />
                <Segmented<MemoryScope>
                  aria-label="Memory scope"
                  value={newScope}
                  onChange={setNewScope}
                  options={[
                    { value: "user", label: "User" },
                    { value: "project", label: "Project" },
                    { value: "agent", label: "Agent" },
                  ]}
                />
              </div>
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="What should Helix remember?"
                aria-label="Memory content"
                rows={2}
                className="text-[12.5px]"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button onClick={addMemory} disabled={!newTitle.trim() || !newContent.trim()}>
                  Save memory
                </Button>
              </div>
            </div>
          )}
          {memLoading && <div className="py-4 text-center text-xs text-txt3">Loading memory…</div>}
          {memError && (
            <div className="py-4 text-center text-xs text-bad">
              Couldn&apos;t load memory.{" "}
              <button className="cursor-pointer underline" onClick={loadMemory}>
                Retry
              </button>
            </div>
          )}
          {!memLoading && !memError && memory.length === 0 && (
            <div className="py-4 text-center text-xs text-txt3">No memories yet.</div>
          )}
          {memory.map((entry, i) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-start gap-3 py-2.5",
                i < memory.length - 1 && "border-b border-border"
              )}
            >
              <Pill tone={scopeTone[entry.scope]} className="mt-0.5 shrink-0">
                {entry.scope}
              </Pill>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium">{entry.title}</div>
                <div className="text-xs text-txt2">{entry.content}</div>
              </div>
              <span className="shrink-0 text-[10.5px] text-txt3">{timeAgo(entry.updatedAt)}</span>
              <button
                aria-label={`Delete memory: ${entry.title}`}
                onClick={() => removeMemory(entry.id)}
                className="shrink-0 cursor-pointer rounded-md p-1 text-txt3 hover:bg-panel2 hover:text-bad"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </Card>

        {/* Project guidance */}
        <h3 className="mb-[11px] mt-6 text-sm font-semibold">Project guidance files</h3>
        <Card className="p-[18px]">
          <p className="mb-[13px] text-xs text-txt2">Helix reads these at the repo root as project context.</p>
          <div className="flex flex-wrap gap-2">
            {GUIDANCE_FILES.map((file) => (
              <span
                key={file}
                className="inline-flex items-center gap-1.5 rounded-card-sm border border-border2 bg-panel2 px-2.5 py-1.5 font-mono text-[11.5px] text-txt2"
              >
                <span className="h-1.5 w-1.5 rounded-[2px] bg-accent" />
                {file}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
