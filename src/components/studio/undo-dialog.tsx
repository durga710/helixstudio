/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-open: the preview loads when the dialog opens, same pattern as the studio's fetch-on-mount effects */
"use client";

/**
 * Intentional-undo preview dialog: shows exactly what reverting one intent
 * would change — per-file method badges (exact restore / inverse patch / AI
 * untangle) and a side-by-side Monaco diff — and applies only on explicit
 * approval. A 409 from apply (the workspace moved on) re-previews instead
 * of clobbering.
 */

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Bot, FileX2, Loader2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";

const MonacoDiff = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-txt3">
      <span className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> loading diff…
      </span>
    </div>
  ),
});

interface UndoEntryDto {
  path: string;
  action: "write" | "delete";
  current: string | null;
  proposed: string | null;
  method: "exact" | "patch" | "ai";
  note?: string;
}

interface ProposalDto {
  entries: UndoEntryDto[];
  unresolved: { path: string; reason: string }[];
  baseHashes: Record<string, string>;
}

const METHOD_META: Record<UndoEntryDto["method"], { label: string; tone: "green" | "amber" | "red" }> = {
  exact: { label: "exact restore", tone: "green" },
  patch: { label: "patched", tone: "amber" },
  ai: { label: "AI untangle", tone: "red" },
};

export function UndoDialog({
  workspaceId,
  intent,
  monacoTheme,
  onClose,
  onApplied,
}: {
  workspaceId: string;
  /** Null = closed. */
  intent: { id: string; title: string } | null;
  monacoTheme: "light" | "vs-dark";
  onClose: () => void;
  onApplied: (changes: { written: string[]; deleted: string[] }) => void;
}) {
  const { toast } = useToast();
  const [proposal, setProposal] = useState<ProposalDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!intent) return;
    setLoading(true);
    setError(null);
    setProposal(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/intents/${intent.id}/undo-preview`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message ?? "Couldn't build the undo preview.");
      } else {
        const p = json.data as ProposalDto;
        setProposal(p);
        setSelected(p.entries[0]?.path ?? null);
      }
    } catch {
      setError("Couldn't build the undo preview.");
    }
    setLoading(false);
  }, [workspaceId, intent]);

  useEffect(() => {
    if (intent) void loadPreview();
    else {
      setProposal(null);
      setError(null);
      setSelected(null);
    }
  }, [intent, loadPreview]);

  async function apply() {
    if (!intent || !proposal || applying) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/intents/${intent.id}/undo-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: proposal.entries.map((e) => ({ path: e.path, action: e.action, proposed: e.proposed })),
          baseHashes: proposal.baseHashes,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 409) {
        toast("The workspace changed since the preview — refreshing it.");
        await loadPreview();
      } else if (!res.ok || !json?.ok) {
        toast(json?.error?.message ?? "Undo failed.");
      } else {
        toast(`Reverted: ${intent.title || "change"}`);
        onApplied(json.data.changes);
        onClose();
      }
    } catch {
      toast("Undo failed.");
    }
    setApplying(false);
  }

  const entry = proposal?.entries.find((e) => e.path === selected) ?? null;

  return (
    <Dialog open={!!intent} onOpenChange={(open) => !open && !applying && onClose()}>
      <DialogContent className="top-[8vh] w-[min(1100px,95vw)]">
        <DialogHeader
          title={`Undo: ${intent?.title || "change"}`}
          description="Review exactly what gets reverted. Later work is preserved; nothing is applied until you approve."
        />

        <div className="flex h-[60vh] min-h-0 flex-col">
          {loading ? (
            <div className="grid flex-1 place-items-center text-sm text-txt3">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> working out the safest revert…
              </span>
            </div>
          ) : error ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-sm text-warn">{error}</div>
          ) : !proposal ? null : proposal.entries.length === 0 && proposal.unresolved.length === 0 ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-sm text-txt2">
              Nothing to revert — the workspace already matches the state before this change.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <aside className="scroll-area w-64 shrink-0 overflow-y-auto border-r border-border p-2">
                <div className="px-2 py-1">
                  <span className="label-tactical">Revert plan</span>
                </div>
                <ul className="space-y-px">
                  {proposal.entries.map((e) => (
                    <li key={e.path}>
                      <button
                        type="button"
                        onClick={() => setSelected(e.path)}
                        title={e.note ? `${e.path} — ${e.note}` : e.path}
                        className={cn(
                          "flex w-full flex-col gap-1 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                          selected === e.path ? "bg-hl text-txt" : "text-txt2 hover:bg-panel2 hover:text-txt",
                        )}
                      >
                        <span className="flex w-full items-center gap-1.5">
                          {e.action === "delete" && <FileX2 className="h-3 w-3 shrink-0 text-bad" />}
                          <span className="min-w-0 truncate font-mono text-[11px]">{e.path}</span>
                        </span>
                        <Pill tone={METHOD_META[e.method].tone}>
                          {e.method === "ai" && <Bot className="h-3 w-3" />}
                          {e.action === "delete" ? `delete · ${METHOD_META[e.method].label}` : METHOD_META[e.method].label}
                        </Pill>
                      </button>
                    </li>
                  ))}
                </ul>

                {proposal.unresolved.length > 0 && (
                  <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_8%,transparent)] px-2.5 py-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-warn">
                      <AlertTriangle className="h-3 w-3" /> Couldn&apos;t resolve
                    </div>
                    <ul className="space-y-1 text-[11px] text-txt2">
                      {proposal.unresolved.map((u) => (
                        <li key={u.path}>
                          <span className="font-mono">{u.path}</span> — {u.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </aside>

              <div className="min-w-0 flex-1">
                {entry ? (
                  entry.action === "delete" ? (
                    <div className="grid h-full place-items-center px-6 text-center">
                      <div>
                        <FileX2 className="mx-auto mb-3 h-8 w-8 text-bad" />
                        <p className="text-sm text-txt2">
                          <span className="font-mono text-[12px]">{entry.path}</span> will be deleted
                        </p>
                        <p className="mt-1 text-xs text-txt3">
                          This file was introduced by the change being undone.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <MonacoDiff
                      key={entry.path}
                      theme={monacoTheme}
                      original={entry.current ?? ""}
                      modified={entry.proposed ?? ""}
                      options={{
                        readOnly: true,
                        renderSideBySide: true,
                        fontSize: 12.5,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        padding: { top: 12 },
                      }}
                    />
                  )
                ) : (
                  <div className="grid h-full place-items-center text-sm text-txt3">
                    Select a file to preview its revert.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {proposal?.entries.some((e) => e.method === "ai") && (
            <span className="flex items-center gap-1.5 text-[11px] text-warn">
              <Bot className="h-3 w-3" /> AI-untangled files — review them closely before applying.
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={applying}>
              Cancel
            </Button>
            <Button
              onClick={() => void apply()}
              disabled={applying || loading || !proposal || proposal.entries.length === 0}
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
              Apply undo{proposal?.entries.length ? ` (${proposal.entries.length} file${proposal.entries.length === 1 ? "" : "s"})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
