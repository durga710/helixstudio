"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/utils";

/**
 * The workspace's cloud environment: the setup script that installs deps
 * (cached as a sandbox snapshot so preview + run_command start warm) and a
 * rebuild control. Empty script = back to the auto-derived default.
 */
export function EnvDialog({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [script, setScript] = useState("");
  const [custom, setCustom] = useState(false);
  const [cached, setCached] = useState(false);
  const [readyAt, setReadyAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/env`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const d = json.data ?? json;
        setScript(d.setupScript ?? "");
        setCustom(Boolean(d.custom));
        setCached(Boolean(d.cached));
        setReadyAt(d.readyAt ?? null);
      })
      .catch(() => toast("Couldn't load the environment."))
      .finally(() => setLoading(false));
  }, [workspaceId, toast]);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/env`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupScript: script }),
    });
    setSaving(false);
    if (res.ok) {
      toast("Setup script saved — the environment rebuilds on the next run.");
      setCustom(Boolean(script.trim()));
      setCached(false);
      setReadyAt(null);
    } else {
      toast("Couldn't save the setup script.");
    }
  }

  async function rebuild() {
    if (rebuilding) return; // guard against a double-click firing two rebuilds
    setRebuilding(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/env`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rebuild" }),
      });
      if (res.ok) {
        toast("Cache cleared — the next run reinstalls and re-snapshots.");
        setCached(false);
        setReadyAt(null);
      } else {
        toast("Couldn't rebuild the environment — try again.");
      }
    } catch {
      toast("Network error — try again.");
    }
    setRebuilding(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="glass-panel-strong fade-up flex w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <Settings2 className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-medium text-txt">Environment</h2>
          <Pill tone={cached ? "green" : "neutral"} className="ml-2">
            {cached ? `cached${readyAt ? ` · ${timeAgo(readyAt)}` : ""}` : "not built"}
          </Pill>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto text-txt3 transition-colors hover:text-txt">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-xs text-txt2">
            Commands that prepare the cloud VM — installing dependencies before preview and
            <span className="font-mono"> run_command</span>. The result is cached so later runs start in
            seconds instead of reinstalling. Leave blank to use the auto-detected default.
          </p>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-txt3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
            </div>
          ) : (
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={4}
              spellCheck={false}
              placeholder="npm install --no-audit --no-fund"
              className="w-full resize-y rounded-lg border border-border2 bg-panel2 px-3 py-2 font-mono text-xs text-txt outline-none focus:border-accent"
            />
          )}
          <p className="text-[11px] text-txt3">
            {custom ? "Using your custom setup script." : "Using the auto-detected default for this stack."}{" "}
            Example: <span className="font-mono">npm install &amp;&amp; npx prisma generate</span>
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3.5">
          <Button variant="ghost" onClick={rebuild} disabled={loading || rebuilding}>
            {rebuilding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Rebuild environment
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={save} disabled={saving || loading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
